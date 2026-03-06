import { Router } from "express";
import { TipLevel, JITO_TIP_ACCOUNTS, JitoRegion } from "@sentinel/core";

export const bundleRoutes = Router();

/**
 * POST /v1/bundle/tip
 * Calculate a Jito tip amount and return a random tip account.
 *
 * Body: { level?: "low"|"medium"|"high"|"very_high"|"turbo", region?: string, multiplier?: number }
 */
bundleRoutes.post("/tip", (req, res) => {
  try {
    const { level = "medium", region = "default", multiplier = 1 } = req.body;

    const tipLevels: Record<string, TipLevel> = {
      low: TipLevel.Low,
      medium: TipLevel.Medium,
      high: TipLevel.High,
      very_high: TipLevel.VeryHigh,
      turbo: TipLevel.Turbo,
    };

    const tipAmount = Math.floor((tipLevels[level] || TipLevel.Medium) * multiplier);
    const jitoRegion = (region as JitoRegion) || JitoRegion.Default;
    const accounts = JITO_TIP_ACCOUNTS[jitoRegion] || JITO_TIP_ACCOUNTS[JitoRegion.Default];
    const tipAccount = accounts[Math.floor(Math.random() * accounts.length)];

    res.json({
      tipAmount,
      tipAmountSol: tipAmount / 1e9,
      tipAccount: tipAccount.address,
      region: jitoRegion,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/**
 * POST /v1/bundle/submit
 * Submit a Jito bundle (Pro plan only).
 * Note: Requires client to provide serialized transactions.
 *
 * Body: { transactions: string[], region?: string, tipLevel?: string }
 */
bundleRoutes.post("/submit", (req, res) => {
  // This endpoint requires Jito Block Engine access.
  // In production, the server would forward to Jito.
  // For now, return the expected format for integration testing.
  const { transactions, region = "default" } = req.body;

  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    res.status(400).json({ error: "transactions array is required (base64-encoded)" });
    return;
  }

  res.json({
    status: "accepted",
    message: "Bundle submission requires Pro plan with Jito Block Engine access",
    transactionCount: transactions.length,
    region,
  });
});

/**
 * GET /v1/bundle/status/:bundleId
 * Get the status of a submitted bundle (Pro plan only).
 */
bundleRoutes.get("/status/:bundleId", (req, res) => {
  const { bundleId } = req.params;

  res.json({
    bundleId,
    status: "pending",
    message: "Bundle status tracking requires Pro plan with Jito Block Engine access",
  });
});
