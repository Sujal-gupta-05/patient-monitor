const Joi = require("joi");

const staffRegisterSchema = Joi.object({
    name: Joi.string().trim().min(1).required(),

    email: Joi.string().email().required(),

    password: Joi.string().trim().min(8).required(),

    role: Joi.string()
    .valid('nurse', 'doctor')
    .required(),

    ward: Joi.string().trim().min(1).required()
});


function validateStaffRegister(req, res, next){
    const {error} = staffRegisterSchema.validate(req.body);

    if(error){
        return res.status(400).json({error : error.details[0].message});
    }
    next();
}

module.exports = validateStaffRegister;