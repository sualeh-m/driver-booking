import type { Request, Response, NextFunction } from "express";

export function getUserId(req: Request): number | null {
  return req.session.userId ?? null;
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
