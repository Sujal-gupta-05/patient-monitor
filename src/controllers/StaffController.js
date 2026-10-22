const bcrypt = require('bcrypt');
const pool = require('../config/db');
const passport = require('../config/passport');

module.exports.registerStaff = async (req, res, next) => {
    try {
        const { name, email, password, role, ward } = req.body;
        
        const hashedPassword = await bcrypt.hash(password, 10);


        const result = await pool.query("INSERT INTO staff (name, email, password, role, ward) VALUES ($1, $2, $3, $4, $5) RETURNING name, email, role, ward",
            [name, email, hashedPassword, role, ward]
        );
        
       
        return res.status(201).json(result.rows[0]);
        
        
    } catch (err) {
        return next(err);
    }
}

module.exports.loginStaff = (req, res, next) => {
    passport.authenticate("local", (err, staff, info) => {
        if(err) {
           return next(err);
        }

        if (!staff) {
            return res.status(401).json({ error: info.message });
        }

        req.logIn(staff, (err) => {
            if (err) {
                return next(err);
            }
            return res.status(200).json({ message: 'Logged in', staff: { s_id: staff.s_id, name: staff.name, role: staff.role } });
        });
    })(req, res, next);
}

module.exports.logoutStaff = (req, res, next) => {
    req.logout((err) => {
        if(err){
            return next(err);
        }
        return res.status(200).json({message: "Logged out successfully"});
    });
}