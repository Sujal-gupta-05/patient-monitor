const Joi = require("joi");

const idSchema = Joi.object({
    id: Joi.number().integer().positive().required()
}).unknown(true);

function validateId(req, res, next){
    const {error} = idSchema.validate(req.params);

    if(error){
        return res.status(400).json({error: "Invalid Id"});
    }
    next();
}

module.exports = validateId;