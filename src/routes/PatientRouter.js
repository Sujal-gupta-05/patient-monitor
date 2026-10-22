const express = require('express');
const router = express.Router();
const validatePatient = require('../middleware/validatePatient');
const requireAuth = require("../middleware/requireAuth.js");
const requireRole = require('../middleware/requireRole.js');
const validateVitals = require("../middleware/validateVitals.js");
const validateId = require("../middleware/validateId.js");

const validateAssignmentId = require("../middleware/validateAssignmentId.js");
const validateAssignment = require("../middleware/validateAssignment.js");
const validateHistoryQuery = require("../middleware/validateHistoryQuery.js");

const {
    getAllPatients,
    createPatient,
    getPatientById,
    updatePatient

} = require("../controllers/PatientController.js");


const { assignStaffToPatient, unassignStaffFromPatient} = require('../controllers/AssignmentController');

const { createVitalReading, getVitalHistory } = require("../controllers/VitalReadingController.js");


router.route("/")
 .get(requireAuth, getAllPatients)
 .post(requireAuth, requireRole("admin"), validatePatient, createPatient);

router.route("/:id")
 .get(requireAuth, validateId, getPatientById)
 .put(requireAuth, requireRole("admin"), validateId, validatePatient, updatePatient);

router.route('/:id/vitals')
.get(requireAuth, requireRole('nurse', 'doctor'), validateId, validateHistoryQuery, getVitalHistory)
.post(requireAuth, requireRole('nurse', 'doctor'), validateId, validateVitals, createVitalReading);

router.post('/:id/assign', requireAuth, requireRole('admin'), validateId, validateAssignment, assignStaffToPatient);
router.put('/:id/unassign/:assignmentId', requireAuth, requireRole('admin'), validateId, validateAssignmentId, unassignStaffFromPatient);

module.exports = router;

