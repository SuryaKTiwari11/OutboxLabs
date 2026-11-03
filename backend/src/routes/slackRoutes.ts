// ─────────────────────────────────────────────────────────────
//  routes/slackRoutes.ts
//  Slack OAuth connect / disconnect routes.
// ─────────────────────────────────────────────────────────────

import { Router } from "express";
import { slackController } from "../controllers/slackController";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware as never);

router.get(    "/connect",    slackController.connect    as never);
router.get(    "/callback",   slackController.callback   as never);
router.delete( "/disconnect", slackController.disconnect as never);
router.get(    "/status",     slackController.status     as never);
router.post(   "/test",       slackController.sendTest   as never);

export { router as slackRouter };

