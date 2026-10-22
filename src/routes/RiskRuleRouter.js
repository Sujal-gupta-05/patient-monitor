const express = require("express");
const router = express.Router();

const { getRiskRules, updateRiskRule } = require("../controllers/RiskRuleControlller.js");
const requireAuth = require("../middleware/requireAuth.js");
const requireRole = require("../middleware/requireRole.js");

router.get("/", requireAuth, requireRole("admin"), getRiskRules);

router.put("/:vitalType", requireAuth, requireRole("admin"), updateRiskRule);
module.exports = router;