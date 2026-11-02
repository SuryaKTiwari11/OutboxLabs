// =============================================================================
//  controllers/senderController.ts
//  Thin controller — delegates all logic to SenderService.
//  Follows the pattern: validate in router → extract from req → call service.
// =============================================================================

import { Response, NextFunction } from "express";
import { AuthenticatedRequest, ApiResponse } from "../types";
import { senderService } from "../services/senderService";

export const senderController = {
  /**
   * POST /api/senders/ethereal
   * Auto-generate an Ethereal (fake) sender account.
   * No SMTP credentials required — perfect for demos.
   */
  async createEthereal(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const sender = await senderService.createEtherealSender(req.userId!, {
        displayName: req.body.displayName ?? "Default Sender",
      });

      const response: ApiResponse = {
        success: true,
        data: sender,
        message:
          "Ethereal sender created. Check etherealPassOnce to log into https://ethereal.email",
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/senders/custom
   * Create a sender with user-provided SMTP credentials.
   */
  async createCustom(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const sender = await senderService.createCustomSender(req.userId!, req.body);
      const response: ApiResponse = { success: true, data: sender };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/senders
   * List all active senders for the authenticated user.
   */
  async list(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const senders = await senderService.listSenders(req.userId!);
      const response: ApiResponse = { success: true, data: senders };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/senders/:id
   * Get a single sender by ID (must belong to authenticated user).
   */
  async getById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const sender = await senderService.getSender(req.params.id!, req.userId!);
      const response: ApiResponse = { success: true, data: sender };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/senders/:id
   * Soft-delete a sender (sets isActive = false).
   */
  async remove(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      await senderService.deleteSender(req.params.id!, req.userId!);
      const response: ApiResponse = { success: true, message: "Sender deactivated" };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
};

