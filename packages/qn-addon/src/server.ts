import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import { guardRoutes } from "./routes/guard";
import { patternRoutes } from "./routes/patterns";
import { bundleRoutes } from "./routes/bundle";
import { provisionRoutes } from "./routes/provision";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3050;

app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT || "100"),
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Healthcheck
app.get("/healthcheck", (_req, res) => {
  res.json({ status: "ok", service: "fabrknt-defi-toolkit", version: "0.1.0" });
});

// QuickNode provisioning
app.use("/", provisionRoutes);

// API routes
app.use("/v1/guard", guardRoutes);
app.use("/v1/pattern", patternRoutes);
app.use("/v1/bundle", bundleRoutes);

app.listen(PORT, () => {
  console.log(`Sentinel QN Add-On running on port ${PORT}`);
});

export default app;
