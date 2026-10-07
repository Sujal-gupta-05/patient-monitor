const Joi = require('joi');

const patientSchema = Joi.object({
    name: Joi.string().trim().min(1).required(),
    dob: Joi.date().max('now').required(),
    ward: Joi.string().trim().min(1).required(),
    bed: Joi.string().trim().min(1).required(),
    status: Joi.string().valid('admitted', 'discharged').optional()
});

function validatePatient(req, res, next) {
    const { error } = patientSchema.validate(req.body);

    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    next();
}

module.exports = validatePatient;