const express = require("express");
const router = express.Router();


const {

    getAlerts,
    getAlertById,
    acknowledgeAlert,
    resolveAlert,
    retractAlert

} = require("../controllers/AlertController.js");

const requireAuth = require("../middleware/requireAuth.js");
const requireRole = require("../middleware/requireRole.js");

router.use(requireAuth, requireRole("doctor", "nurse"));

const validateId = require("../middleware/validateId.js");
const validateRetraction = require("../middleware/validateRetraction.js");

router.get("/", getAlerts);

router.get("/:id", validateId, getAlertById);

router.patch("/:id/acknowledge", validateId, acknowledgeAlert);

router.patch("/:id/resolve", validateId, resolveAlert);

router.patch("/:id/retract", validateId, validateRetraction, retractAlert);

module.exports = router;