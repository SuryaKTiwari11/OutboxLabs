// ─────────────────────────────────────────────────────────────
//  routes/emailRoutes.ts
//  All email scheduling endpoints — protected by authMiddleware.
// ─────────────────────────────────────────────────────────────

import { Router } from "express";
import { z } from "zod";
import { emailController } from "../controllers/emailController";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { AuthenticatedRequest } from "../types";

const router = Router();

// All email routes require authentication
router.use(authMiddleware as never);

// ── Validation schemas ─────────────────────────────────────────
const datetimeSchema = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: "Invalid datetime format",
});

const scheduleSchema = z.object({
  recipientEmail: z.string().email(),
  subject:        z.string().min(1).max(500),
  body:           z.string().min(1),
  scheduledAt:    datetimeSchema,
  senderId:       z.string().min(1, "Sender ID is required"),
  campaignId:     z.string().optional(),
});

const bulkScheduleSchema = z.object({
  recipients:     z.array(z.string().email()).min(1).max(10000),
  subject:        z.string().min(1).max(500),
  body:           z.string().min(1),
  startAt:        datetimeSchema,
  delayBetweenMs: z.coerce.number().int().min(0).max(3_600_000),
  hourlyLimit:    z.coerce.number().int().min(1).max(10000),
  senderId:       z.string().min(1, "Sender ID is required"),
  campaignName:   z.string().max(200).optional(),
});

// ── Routes ─────────────────────────────────────────────────────
router.get(  "/scheduled",      emailController.getScheduled  as never);
router.get(  "/sent",           emailController.getSent       as never);
router.get(  "/search",         emailController.search        as never);
router.get(  "/:id",            emailController.getById       as never);
router.post( "/schedule",       validate(scheduleSchema),     emailController.schedule       as never);
router.post( "/bulk-schedule",  validate(bulkScheduleSchema), emailController.bulkSchedule  as never);

export { router as emailRouter };

