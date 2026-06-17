import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody, ChangePasswordBody } from "@workspace/api-zod";
import { serializeUser } from "../lib/serialize";
import { hashPassword, verifyPassword } from "../lib/password";

// Public router: only the login endpoint, registered before requireAuth.
export const publicAuthRouter: IRouter = Router();

publicAuthRouter.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`);

  // Same generic message whether the email is unknown or the password is wrong,
  // so the endpoint does not reveal which accounts exist.
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.userId = user.id;
  res.json(serializeUser(user));
});

// Session router: requires an authenticated session and is registered before
// the password-change gate so a user forced to reset can still reach these.
const router: IRouter = Router();

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.sendStatus(204);
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (userId == null) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }

  res.json(serializeUser(user));
});

router.post("/auth/change-password", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (userId == null) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }

  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }

  if (!verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      passwordHash: hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
    })
    .where(eq(usersTable.id, userId))
    .returning();

  res.json(serializeUser(updated));
});

export default router;
