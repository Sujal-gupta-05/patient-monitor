const pool = require("../config/db.js");

module.exports.getAllPatients = async(req, res) => {
    try{
        let result;

        if(req.user.role === "admin"){
            result = await pool.query('SELECT * FROM patient');
        }
        else{
            result = await pool.query(
                "SELECT patient.* FROM patient JOIN staff_patient_assignment ON patient.p_id = staff_patient_assignment.p_id WHERE staff_patient_assignment.s_id = $1 AND staff_patient_assignment.unassigned_at IS NULL",
                [req.user.s_id]
            );
        } 
        res.status(200).json(result.rows);
    }
    catch(err){
        console.log(err);
        res.status(500).json({error: "Failed to fetch patients"});
    }
    
}

module.exports.createPatient = async(req, res) => {
    console.log(req.body);
    
    try{
        const {name, dob, ward, bed} = req.body;

        const result = await pool.query(
            "INSERT INTO patient (name, dob, ward, bed) VALUES ($1, $2, $3, $4) RETURNING *",
            [name, dob, ward, bed]
        );
        console.log(result);
        res.status(201).json(result.rows[0]);
    }
    catch(err){
        console.error(err);
        res.status(500).json({ error: 'Failed to create patient' });
    }
    
}


module.exports.getPatientById = async(req, res) => {
   try{
    let result;
    const {id} = req.params;

    if(req.user.role == "admin"){
        result = await pool.query("SELECT * FROM patient where p_id = $1",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        return res.status(200).json(result.rows[0]);
    }
    else{
        result = await pool.query(
            "SELECT patient.* FROM patient JOIN staff_patient_assignment ON patient.p_id = staff_patient_assignment.p_id WHERE staff_patient_assignment.s_id = $1 AND staff_patient_assignment.unassigned_at IS NULL AND patient.p_id = $2",
            [req.user.s_id, id]
        );
    }
        if (result.rows.length > 0) {
            return res.status(200).json(result.rows[0]);
        }

        const exists = await pool.query("SELECT p_id FROM patient WHERE p_id = $1", [id]);

        if (exists.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        return res.status(403).json({ error: 'You are not assigned to this patient' });
   }
    catch(err){
        console.log(err);
        res.status(500).json({ error: 'Failed to fetch patient' });
    }
}


module.exports.updatePatient = async(req, res) => {
    try{
        const {id} = req.params;
        const {name, dob, ward, bed, status} = req.body;

        const result = await pool.query(
            "UPDATE patient SET name = $1, dob = $2, ward = $3, bed = $4, status = COALESCE($5, status) WHERE p_id = $6 RETURNING *",
            [name, dob, ward, bed, status, id]
        );

        if(result.rows.length === 0){
            return res.status(404).json({ error: 'Patient not found' });
        }
        return res.status(200).json(result.rows[0]);
    }
    catch(err){
        console.log(err);
        res.status(500).json({error : "failed to update patient"});
    }
}