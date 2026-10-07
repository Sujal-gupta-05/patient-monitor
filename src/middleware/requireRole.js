function requireRole(...allowedRoles) {
    return function(req, res, next) {
        if(allowedRoles.includes(req.user.role)){
            return next();
        }
        res.status(403).json({error: "You donot have permission to perform this action"});
    }
}

module.exports = requireRole;