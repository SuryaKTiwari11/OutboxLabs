// ─────────────────────────────────────────────────────────────
//  controllers/emailController.ts
//  Thin controller layer — delegates to EmailService.
//  Pattern: Controllers only handle HTTP concerns (parse req, send res).
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest, ApiResponse } from "../types";
import { emailService } from "../services/emailService";

export const emailController = {
  // POST /api/emails/schedule
  async schedule(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const email = await emailService.scheduleSingle(req.userId, req.body);
      const response: ApiResponse = {
        success: true,
        data: email,
        message: "Email scheduled successfully",
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },

  // POST /api/emails/bulk-schedule
  async bulkSchedule(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await emailService.scheduleBulk(req.userId, req.body);
      const response: ApiResponse = { success: true, data: result };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/emails/scheduled
  async getScheduled(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page  = parseInt(req.query["page"]  as string ?? "1");
      const limit = parseInt(req.query["limit"] as string ?? "20");
      const result = await emailService.getScheduled(req.userId, page, limit);
      const response: ApiResponse = { success: true, ...result };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/emails/sent
  async getSent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page  = parseInt(req.query["page"]  as string ?? "1");
      const limit = parseInt(req.query["limit"] as string ?? "20");
      const result = await emailService.getSent(req.userId, page, limit);
      const response: ApiResponse = { success: true, ...result };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/emails/:id
  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const email = await emailService.getById(req.params["id"]!, req.userId);
      const response: ApiResponse = { success: true, data: email };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/emails/search
  async search(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await emailService.search({
        userId: req.userId,
        query:  req.query["q"]      as string,
        status: req.query["status"] as never,
        page:   parseInt(req.query["page"]  as string ?? "1"),
        limit:  parseInt(req.query["limit"] as string ?? "20"),
        from:   req.query["from"]   as string,
        to:     req.query["to"]     as string,
      });
      const response: ApiResponse = { success: true, data: result };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
};

