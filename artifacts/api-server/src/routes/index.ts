import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import contractsRouter from "./contracts";
import driversRouter from "./drivers";
import gridRouter from "./grid";
import bookingsRouter from "./bookings";
import auditRouter from "./audit";
import dashboardRouter from "./dashboard";
import previewsRouter from "./previews";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Public routes: health check and the pick-your-name login flow
// (the login screen lists users via GET /users before a session exists).
router.use(healthRouter);
router.use(authRouter);

// Everything below requires an authenticated session.
router.use(requireAuth);
router.use(contractsRouter);
router.use(driversRouter);
router.use(gridRouter);
router.use(bookingsRouter);
router.use(auditRouter);
router.use(dashboardRouter);
router.use(previewsRouter);

export default router;
