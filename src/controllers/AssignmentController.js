const pool = require('../config/db.js');

module.exports.assignStaffToPatient = async(req, res) => {
    try{
        const {id} = req.params;
        const {s_id} = req.body;

        const patientCheck = await pool.query("SELECT p_id FROM patient WHERE p_id = $1", [id]);
        if (patientCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        const staffCheck = await pool.query("SELECT s_id FROM staff WHERE s_id = $1", [s_id]);
        if (staffCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Staff member not found' });
        }
        if (staffCheck.rows[0].role === 'admin') {
            return res.status(400).json({ error: 'Admins cannot be assigned to patients' });
        }

        const activeCheck = await pool.query(
            'SELECT id FROM staff_patient_assignment WHERE s_id = $1 AND p_id = $2 AND unassigned_at IS NULL',
            [s_id, id]
        );
        if (activeCheck.rows.length > 0) {
            return res.status(409).json({ error: 'This staff member is already assigned to this patient' });
        }

        const result = await pool.query("INSERT INTO staff_patient_assignment (s_id, p_id) VALUES ($1, $2) RETURNING *",
            [s_id, id]
        );
        res.status(201).json(result.rows[0]);
    }
    catch(err){
        console.log(err);
        res.status(500).json({ error: 'Failed to assign staff to patient' });
    }
}

module.exports.unassignStaffFromPatient = async(req, res) => {
    try{
        let {assignmentId} = req.params;
        const result = await pool.query("UPDATE staff_patient_assignment SET unassigned_at = NOW() WHERE id = $1 AND unassigned_at IS NULL RETURNING * ",
            [assignmentId]
        );
        if(result.rows.length === 0) {
            return res.status(404).json({ error: "Active assignment not found" });
        }
        res.status(200).json(result.rows[0]);
    }
    catch(err){
        console.log(err);
        res.status(500).json({error : "Failed to unassign staff from patient"});
    }
}