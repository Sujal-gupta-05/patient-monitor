const pool = require("../config/db.js");

module.exports.createVitalReading = async(req, res) => {
    try{
        let {id} = req.params;
        let {s_id} = req.user;
        const { readings } = req.body;

        const assigned = await pool.query(
            "SELECT id FROM staff_patient_assignment WHERE s_id = $1 AND p_id = $2 AND unassigned_at IS NULL",
            [s_id, id]
        );
        if (assigned.rows.length === 0) {

            const exists = await pool.query("SELECT p_id FROM patient WHERE p_id = $1", [id]);

            if (exists.rows.length === 0) {
                return res.status(404).json({ error: "Patient not found" });         
            }
            return res.status(403).json({ error: "You are not assigned to this patient" });
        }
        const types = readings.map(r => r.vital_type);
        const values = readings.map(r => r.value);

        const result = await pool.query(
            "INSERT INTO vital_reading (p_id, vital_type, value) SELECT $1::int, * FROM unnest($2::vital_type_enum[], $3::numeric[]) RETURNING *",
            [id, types, values]
        );
        res.status(201).json(result.rows);
    }
    catch(err){
        console.log(err);
        res.status(500).json({error : "Failed to create vital reading"});
    }
}