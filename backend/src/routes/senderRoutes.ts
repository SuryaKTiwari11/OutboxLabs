// =============================================================================
//  routes/senderRoutes.ts
//  Sender Account management endpoints.
//  All routes require JWT authentication (authMiddleware).
// =============================================================================

import { Router } from "express";
import { z } from "zod";
import { senderController } from "../controllers/senderController";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();

// All sender routes require authentication
router.use(authMiddleware as never);

// ── Validation schemas ────────────────────────────────────────────────────────

/**
 * Schema for creating an Ethereal (auto-generated) sender.
 * Only needs a display name — we generate Ethereal credentials automatically.
 */
const createEtherealSchema = z.object({
  displayName: z.string().min(1).max(100).default("Default Sender"),
});

/**
 * Schema for creating a custom SMTP sender.
 * Supports common ports: 25 (SMTP), 465 (SMTPS), 587 (STARTTLS).
 */
const createCustomSchema = z.object({
  displayName: z.string().min(1).max(100),
  fromEmail:   z.string().email(),
  smtpHost:    z.string().min(1),
  smtpPort:    z.number().int().min(1).max(65535).default(587),
  smtpUser:    z.string().min(1),
  smtpPass:    z.string().min(1),
  smtpSecure:  z.boolean().optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// Create an Ethereal (fake) sender — no real SMTP needed
router.post("/ethereal", validate(createEtherealSchema), senderController.createEthereal as never);

// Create a custom SMTP sender
router.post("/custom",   validate(createCustomSchema),   senderController.createCustom   as never);

// List all senders
router.get("/",          senderController.list           as never);

// Get specific sender
router.get("/:id",       senderController.getById        as never);

// Soft-delete a sender
router.delete("/:id",    senderController.remove         as never);

export { router as senderRouter };

