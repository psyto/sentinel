import { Request, Response, NextFunction } from "express";
import { getActiveInstanceByEndpointId } from "../db/models";
import type { Instance } from "../types/quicknode";

declare global {
  namespace Express {
    interface Request {
      instance?: Instance;
    }
  }
}

export function instanceLookup(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const endpointId = req.headers["x-instance-id"] as string | undefined;

  if (!endpointId) {
    res.status(400).json({ error: "Missing X-INSTANCE-ID header" });
    return;
  }

  const instance = getActiveInstanceByEndpointId(endpointId);

  if (!instance) {
    res.status(404).json({ error: "Instance not found or inactive" });
    return;
  }

  req.instance = instance;
  next();
}
