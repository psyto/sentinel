import { Router, Request, Response } from "express";
import { basicAuth } from "../middleware/basic-auth";
import { provisionLimiter } from "../middleware/rate-limit";
import {
  createInstance,
  getInstanceByEndpointId,
  updateInstance,
  deactivateInstance,
  deprovisionByQuicknodeId,
} from "../db/models";
import type {
  ProvisionRequest,
  UpdateRequest,
  DeactivateRequest,
  DeprovisionRequest,
} from "../types/quicknode";

const router = Router();

/* ------------------------------------------------------------------ */
/*  Provision — POST /provision                                       */
/* ------------------------------------------------------------------ */
router.post(
  "/provision",
  provisionLimiter,
  basicAuth,
  (req: Request, res: Response) => {
    try {
      const body = req.body as ProvisionRequest;

      if (!body["quicknode-id"] || !body["endpoint-id"]) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      const existing = getInstanceByEndpointId(body["endpoint-id"]);
      if (existing) {
        res.status(409).json({
          status: "error",
          error: "Instance already provisioned",
        });
        return;
      }

      const instance = createInstance({
        quicknode_id: body["quicknode-id"],
        endpoint_id: body["endpoint-id"],
        wss_url: body["wss-url"] || "",
        http_url: body["http-url"] || "",
        chain: body.chain || "solana",
        network: body.network || "mainnet-beta",
        plan: body.plan || "starter",
        referers: body.referers,
        contract_addresses: body["contract-addresses"],
      });

      res.json({
        status: "success",
        "endpoint-id": instance.endpoint_id,
        plan: instance.plan,
      });
    } catch (err) {
      console.error("[provision] error:", err);
      res.status(500).json({ status: "error", error: "Provisioning failed" });
    }
  },
);

/* ------------------------------------------------------------------ */
/*  Update — PUT /update                                              */
/* ------------------------------------------------------------------ */
router.put(
  "/update",
  provisionLimiter,
  basicAuth,
  (req: Request, res: Response) => {
    try {
      const body = req.body as UpdateRequest;

      if (!body["endpoint-id"]) {
        res.status(400).json({ error: "Missing endpoint-id" });
        return;
      }

      const existing = getInstanceByEndpointId(body["endpoint-id"]);
      if (!existing) {
        res.status(404).json({ status: "error", error: "Instance not found" });
        return;
      }

      const updated = updateInstance(body["endpoint-id"], {
        wss_url: body["wss-url"],
        http_url: body["http-url"],
        chain: body.chain,
        network: body.network,
        plan: body.plan,
        referers: body.referers,
        contract_addresses: body["contract-addresses"],
      });

      res.json({
        status: "success",
        "endpoint-id": updated?.endpoint_id,
        plan: updated?.plan,
      });
    } catch (err) {
      console.error("[update] error:", err);
      res.status(500).json({ status: "error", error: "Update failed" });
    }
  },
);

/* ------------------------------------------------------------------ */
/*  Deactivate — DELETE /deactivate_endpoint                          */
/* ------------------------------------------------------------------ */
router.delete(
  "/deactivate_endpoint",
  provisionLimiter,
  basicAuth,
  (req: Request, res: Response) => {
    try {
      const body = req.body as DeactivateRequest;

      if (!body["endpoint-id"]) {
        res.status(400).json({ error: "Missing endpoint-id" });
        return;
      }

      deactivateInstance(body["endpoint-id"]);

      res.json({ status: "success" });
    } catch (err) {
      console.error("[deactivate] error:", err);
      res.status(500).json({ status: "error", error: "Deactivation failed" });
    }
  },
);

/* ------------------------------------------------------------------ */
/*  Deprovision — DELETE /deprovision                                 */
/* ------------------------------------------------------------------ */
router.delete(
  "/deprovision",
  provisionLimiter,
  basicAuth,
  (req: Request, res: Response) => {
    try {
      const body = req.body as DeprovisionRequest;

      if (!body["quicknode-id"]) {
        res.status(400).json({ error: "Missing quicknode-id" });
        return;
      }

      deprovisionByQuicknodeId(body["quicknode-id"]);

      res.json({ status: "success" });
    } catch (err) {
      console.error("[deprovision] error:", err);
      res
        .status(500)
        .json({ status: "error", error: "Deprovisioning failed" });
    }
  },
);

export default router;
