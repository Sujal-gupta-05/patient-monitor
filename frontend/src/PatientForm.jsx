import { useState } from "react";



export default function PatientForm(){

    const [message, setMessage] = useState("");

    const [name, setName] = useState("");
    const [dob, setDOB] = useState("");
    const [ward, setWard] = useState("");
    const [bed, setBed] = useState("");

    async function handleSubmit(e){
        
        e.preventDefault();


        if (!name.trim() || !dob || !ward.trim() || !bed.trim()) {
            setMessage("Please fill in all fields");
            return;
        }
        
        if (new Date(dob) > new Date()) {
            setMessage("Date of birth cannot be in the future");
            return;
        }

        try{
            const response = await fetch('http://localhost:8080/patients', {
                    method: "POST",
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({name, dob, ward, bed})
                }
            );

            const data = await response.json();
            console.log('Created:', data);

            setMessage("Patient admitted successully");
            setName("");
            setDOB("");
            setWard("");
            setBed("");
        }
        catch(err){
            console.error('Submit failed:', err);
            setMessage("Failed to admit patient");
        }
    }
    
    
        return(
            <div className="container mt-5">
                <div className="row">
                    <div className="col-md-6 offset-md-3">
                        <form onSubmit={handleSubmit}>
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
                                    <input id="patientWard" className="form-control" type="text"  value={ward} onChange={(e) => setWard(e.target.value)} />
                                </div>

                                <div className="mb-3">
                                    <label className="form-label" htmlFor="patientBed">Bed</label>
                                    <input id="patientBed" className="form-control" type="text"  value={bed} onChange={(e) => setBed(e.target.value)} />
                                </div>

                                <button className="btn btn-primary" type="submit">Admit Patient</button>
                                {message && <p className={`mt-3 ${message.includes("success") ? "text-success" : "text-danger"}`}>{message}</p>}
                        </form>
                    </div>
                </div>
            </div>
        )
    
}