import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { RequestHandler } from "express";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

const PgStore = connectPgSimple(session);

const secret = process.env["SESSION_SECRET"];
if (!secret) {
  throw new Error("SESSION_SECRET environment variable is required.");
}

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required.");
}

export const sessionMiddleware: RequestHandler = session({
  store: new PgStore({
    conObject: { connectionString },
    tableName: "session",
  }),
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
});
