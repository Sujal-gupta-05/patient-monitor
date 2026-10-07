const Joi = require("joi");

const staffLoginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
})


function validateStaffLogin(req, res, next){
    const {error} = staffLoginSchema.validate(req.body);
    
    if(error){
        return res.status(400).json({error: error.details[0].message});
    }
    next();
}

module.exports = validateStaffLogin;