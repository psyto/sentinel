import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { config } from "../config";

export function basicAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const encoded = authHeader.slice(6);
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    res.status(401).json({ error: "Invalid credentials format" });
    return;
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  const expectedUser = config.qnBasicAuthUsername;
  const expectedPass = config.qnBasicAuthPassword;

  if (!expectedUser || !expectedPass) {
    res.status(500).json({ error: "Auth not configured" });
    return;
  }

  const userBuffer = Buffer.from(username);
  const expectedUserBuffer = Buffer.from(expectedUser);
  const passBuffer = Buffer.from(password);
  const expectedPassBuffer = Buffer.from(expectedPass);

  const userMatch =
    userBuffer.length === expectedUserBuffer.length &&
    timingSafeEqual(userBuffer, expectedUserBuffer);

  const passMatch =
    passBuffer.length === expectedPassBuffer.length &&
    timingSafeEqual(passBuffer, expectedPassBuffer);

  if (!userMatch || !passMatch) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  next();
}
