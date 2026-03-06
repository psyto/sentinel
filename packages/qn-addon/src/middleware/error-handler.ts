import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("[error-handler]", err.message, err.stack);
  res.status(500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development" ? err.message : undefined,
  });
}
