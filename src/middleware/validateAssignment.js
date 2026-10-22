const Joi = require("joi");

const assignmentSchema = Joi.object({
    s_id: Joi.number().integer().positive().required()
})

function validateAssignment(req, res, next){
    
    const {error} = assignmentSchema.validate(req.body);

    if(error){
        return res.status(400).json({error: error.details[0].message});
    }
    next();
}

module.exports = validateAssignment;