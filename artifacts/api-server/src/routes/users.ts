import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  bookingsTable,
  eventsTable,
  leaversTable,
  auditLogTable,
  messagesTable,
  submissionsTable,
  shiftRequirementsTable,
} from "@workspace/db";
import {
  CreateUserBody,
  UpdateUserParams,
  UpdateUserBody,
  DeleteUserParams,
  ResetUserPasswordParams,
  ResetUserPasswordBody,
} from "@workspace/api-zod";
import { serializeUser } from "../lib/serialize";
import { hashPassword } from "../lib/password";
import { getUserId, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

// Every route in this file is admin-only, enforced on the server. requireAdmin
// is attached per-route (not via router.use) so the gate cannot leak onto other
// routers mounted after this one at the root path.

async function adminCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));
  return row?.n ?? 0;
}

// Case-insensitive email lookup, optionally excluding one user id (for updates).
async function emailTaken(email: string, exceptId?: number): Promise<boolean> {
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email.toLowerCase()}`);
  return rows.some((r) => r.id !== exceptId);
}

router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.name);
  res.json(users.map(serializeUser));
});

router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim();
  if (await emailTaken(email)) {
    res.status(400).json({ error: "A user with that email already exists" });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      name: parsed.data.name.trim(),
      email,
      role: parsed.data.role,
      passwordHash: hashPassword(parsed.data.temporaryPassword),
      mustChangePassword: true,
    })
    .returning();

  res.status(201).json(serializeUser(user));
});

router.patch("/users/:userId", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = params.data.userId;
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
  if (parsed.data.email !== undefined) {
    const email = parsed.data.email.trim();
    if (await emailTaken(email, userId)) {
      res.status(400).json({ error: "A user with that email already exists" });
      return;
    }
    updates.email = email;
  }
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;

  // Never allow demoting the last remaining admin.
  if (
    parsed.data.role === "standard" &&
    existing.role === "admin" &&
    (await adminCount()) <= 1
  ) {
    res.status(400).json({ error: "Cannot demote the last admin" });
    return;
  }

  if (Object.keys(updates).length === 0) {
    res.json(serializeUser(existing));
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, userId))
    .returning();

  res.json(serializeUser(updated));
});

router.delete("/users/:userId", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = params.data.userId;
  if (userId === getUserId(req)) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (existing.role === "admin" && (await adminCount()) <= 1) {
    res.status(400).json({ error: "Cannot delete the last admin" });
    return;
  }

  // FK columns to users are RESTRICT, so detach every reference first (audit
  // rows are preserved, just no longer attributed to the removed account),
  // then delete — all atomically.
  await db.transaction(async (tx) => {
    await tx
      .update(bookingsTable)
      .set({ createdBy: null })
      .where(eq(bookingsTable.createdBy, userId));
    await tx
      .update(bookingsTable)
      .set({ updatedBy: null })
      .where(eq(bookingsTable.updatedBy, userId));
    await tx
      .update(eventsTable)
      .set({ createdBy: null })
      .where(eq(eventsTable.createdBy, userId));
    await tx
      .update(leaversTable)
      .set({ createdBy: null })
      .where(eq(leaversTable.createdBy, userId));
    await tx
      .update(submissionsTable)
      .set({ createdBy: null })
      .where(eq(submissionsTable.createdBy, userId));
    await tx
      .update(shiftRequirementsTable)
      .set({ createdBy: null })
      .where(eq(shiftRequirementsTable.createdBy, userId));
    await tx
      .update(messagesTable)
      .set({ sentBy: null })
      .where(eq(messagesTable.sentBy, userId));
    await tx
      .update(auditLogTable)
      .set({ userId: null })
      .where(eq(auditLogTable.userId, userId));
    await tx.delete(usersTable).where(eq(usersTable.id, userId));
  });

  res.sendStatus(204);
});

router.post(
  "/users/:userId/reset-password",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = ResetUserPasswordParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = ResetUserPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({
        passwordHash: hashPassword(parsed.data.temporaryPassword),
        mustChangePassword: true,
      })
      .where(eq(usersTable.id, params.data.userId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(serializeUser(updated));
  },
);

export default router;
