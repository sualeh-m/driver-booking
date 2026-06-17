import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter, { publicAuthRouter } from "./auth";
import usersRouter from "./users";
import sheetsRouter from "./sheets";
import workersRouter from "./workers";
import gridRouter from "./grid";
import bookingsRouter from "./bookings";
import auditRouter from "./audit";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";
import previewsRouter from "./previews";
import eventsRouter from "./events";
import leaversRouter from "./leavers";
import requirementsRouter from "./requirements";
import submissionsRouter from "./submissions";
import { requireAuth, enforcePasswordChange } from "../lib/auth";

const router: IRouter = Router();

// Public routes: health check and the email/password login.
router.use(healthRouter);
router.use(publicAuthRouter);

// Everything below requires an authenticated session.
router.use(requireAuth);

// Session-scoped auth routes that must stay reachable even when the user is
// being forced to change their password (logout, me, change-password).
router.use(authRouter);

// Block all other actions until a forced password change is completed.
router.use(enforcePasswordChange);

router.use(usersRouter);
router.use(sheetsRouter);
router.use(workersRouter);
router.use(gridRouter);
router.use(bookingsRouter);
router.use(auditRouter);
router.use(dashboardRouter);
router.use(reportsRouter);
router.use(previewsRouter);
router.use(eventsRouter);
router.use(leaversRouter);
router.use(requirementsRouter);
router.use(submissionsRouter);

export default router;
