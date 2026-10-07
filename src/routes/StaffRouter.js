const express = require("express");
const router = express.Router();

const {
      registerStaff,
      loginStaff,
      logoutStaff
} = require("../controllers/StaffController.js");

const requireAuth = require("../middleware/requireAuth.js");

const validateStaffRegister = require("../middleware/validateStaffRegister.js")

const validateStaffLogin = require("../middleware/validateStaffLogin.js");

router.post("/register", validateStaffRegister, registerStaff);
router.post('/login', validateStaffLogin, loginStaff);
router.post("/logout", requireAuth, logoutStaff);

module.exports = router;