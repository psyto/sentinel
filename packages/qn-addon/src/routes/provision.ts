import { Router } from "express";

export const provisionRoutes = Router();

provisionRoutes.post("/provision", (req, res) => {
  const { "quicknode-id": qnId, plan } = req.body;
  console.log(`Provisioning add-on for ${qnId} on plan ${plan}`);
  res.json({
    status: "success",
    "dashboard-url": `https://fabrknt.com/dashboard?qn=${qnId}`,
    "access-url": `https://api.fabrknt.com/sentinel`,
  });
});

provisionRoutes.put("/provision", (req, res) => {
  const { "quicknode-id": qnId, plan } = req.body;
  console.log(`Updating add-on for ${qnId} to plan ${plan}`);
  res.json({ status: "success" });
});

provisionRoutes.delete("/provision/deactivate", (req, res) => {
  const { "quicknode-id": qnId } = req.body;
  console.log(`Deactivating add-on for ${qnId}`);
  res.json({ status: "success" });
});

provisionRoutes.delete("/provision", (req, res) => {
  const { "quicknode-id": qnId } = req.body;
  console.log(`Deprovisioning add-on for ${qnId}`);
  res.json({ status: "success" });
});
