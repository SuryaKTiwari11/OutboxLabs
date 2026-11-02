// ─────────────────────────────────────────────────────────────
//  middleware/validate.ts
//  Zod-based request validation middleware factory.
//  Usage: router.post('/route', validate(mySchema), controller)
// ─────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err); // Caught by errorHandler as ZodError
    }
  };
}

