import { useState, useEffect } from "react";

export default function UpdatePatientForm({ patientId }) {
    const [name, setName] = useState("");
    const [dob, setDOB] = useState("");
    const [ward, setWard] = useState("");
    const [bed, setBed] = useState("");
    const [status, setStatus] = useState("admitted");
    const [message, setMessage] = useState("");

    useEffect(() => {
        async function fetchPatient() {
            try {
                const response = await fetch(`http://localhost:8080/patients/${patientId}`);
                const data = await response.json();
                setName(data.name);
                setDOB(data.dob?.split('T')[0]);
                setWard(data.ward);
                setBed(data.bed);
                setStatus(data.status);
            } catch (err) {
                console.error('Failed to fetch patient:', err);
                setMessage("Failed to load patient data");
            }
        }
        fetchPatient();
    }, [patientId]);

    async function handleEdit(e) {
        e.preventDefault();


        if (!name.trim() || !dob || !ward.trim() || !bed.trim()) {
            setMessage("Please fill in all fields");
            return;
        }
        
        if (new Date(dob) > new Date()) {
            setMessage("Date of birth cannot be in the future");
            return;
        }

        try {
            const response = await fetch(`http://localhost:8080/patients/${patientId}`, {
                method: "PUT",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, dob, ward, bed, status })
            });

            const data = await response.json();
            console.log('Updated:', data);
            setMessage("Patient updated successfully");
        } catch (err) {
            console.error('Update failed:', err);
            setMessage("Failed to update patient");
        }
    }

    return(
        <div className="container mt-5">
            <div className="row">
                <div className="col-md-6 offset-md-3">
                    <form onSubmit={handleEdit}>
                        <div className="mb-3">
                            <label className="form-label" htmlFor="patientName">Name</label>
                            <input id="patientName" className="form-control" type="text" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>

                        <div className="mb-3">
                            <label className="form-label" htmlFor="patientDob">Date of birth</label>
                            <input id="patientDob" className="form-control" type="date" value={dob} onChange={(e) => setDOB(e.target.value)} />
                        </div>

                        <div className="mb-3">
                            <label className="form-label" htmlFor="patientWard">Ward</label>
                            <input id="patientWard" className="form-control" type="text" value={ward} onChange={(e) => setWard(e.target.value)} />
                        </div>

                        <div className="mb-3">
                            <label className="form-label" htmlFor="patientBed">Bed</label>
                            <input id="patientBed" className="form-control" type="text" value={bed} onChange={(e) => setBed(e.target.value)} />
                        </div>

                        <div className="mb-3">
                            <label className="form-label" htmlFor="patientStatus">Status</label>
                            <select id="patientStatus" className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                                <option value="admitted">Admitted</option>
                                <option value="discharged">Discharged</option>
                            </select>
                        </div>

                        <button className="btn btn-primary" type="submit">Save Changes</button>
                        {message && <p className={`mt-3 ${message.includes("success") ? "text-success" : "text-danger"}`}>{message}</p>}
                    </form>
                </div>
            </div>
        </div>
    )
}