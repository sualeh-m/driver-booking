import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
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
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Public routes: health check and the pick-your-name login flow
// (the login screen lists users via GET /users before a session exists).
router.use(healthRouter);
router.use(authRouter);

// Everything below requires an authenticated session.
router.use(requireAuth);
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
