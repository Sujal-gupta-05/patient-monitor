const express = require('express');
const router = express.Router();
const validatePatient = require('../middleware/validatePatient');
const requireAuth = require("../middleware/requireAuth.js");
const requireRole = require('../middleware/requireRole.js');
const validateVitals = require("../middleware/validateVitals.js");

const {
    getAllPatients,
    createPatient,
    getPatientById,
    updatePatient

} = require("../controllers/PatientController.js");


const { assignStaffToPatient, unassignStaffFromPatient} = require('../controllers/AssignmentController');

const { createVitalReading } = require("../controllers/VitalReadingController.js");



router.route("/")
 .get(requireAuth, getAllPatients)
 .post(requireAuth, requireRole("admin"), validatePatient, createPatient);

router.route("/:id")
 .get(requireAuth, getPatientById)
 .put(requireAuth, requireRole("admin"), validatePatient, updatePatient);

router.post('/:id/vitals', requireAuth, requireRole('nurse', 'doctor'), validateVitals, createVitalReading);

router.post('/:id/assign', requireAuth, requireRole('admin'), assignStaffToPatient);
router.put('/:id/unassign/:assignmentId', requireAuth, requireRole('admin'), unassignStaffFromPatient);

module.exports = router;

