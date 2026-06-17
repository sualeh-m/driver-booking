import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";

export function getUserId(req: Request): number | null {
  return req.session.userId ?? null;
}

// Loads the full user row for the current session (role, mustChangePassword,
// etc.). Returns null when there is no session or the user no longer exists.
export async function getCurrentUser(req: Request): Promise<User | null> {
  const id = req.session.userId;
  if (id == null) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id));
  return user ?? null;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.session.userId == null) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  next();
}

// Server-side admin gate. This is the authoritative check for admin-only
// actions; the UI hiding buttons is purely cosmetic.
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// Blocks every action (except the allow-listed auth routes registered before
// this middleware) until a user who must change their password has done so.
export async function enforcePasswordChange(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  if (user.mustChangePassword) {
    res
      .status(403)
      .json({ error: "Password change required", mustChangePassword: true });
    return;
  }
  next();
}
