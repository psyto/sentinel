import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export function requestId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = (req.headers["x-request-id"] as string) || randomUUID();
  res.setHeader("x-request-id", id);
  next();
}
