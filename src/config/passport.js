const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const pool = require('./db');

passport.use(new LocalStrategy(
    {usernameField : "email"},
    async (email, password, done) => {
        try{
            const result = await pool.query('SELECT * FROM staff WHERE email = $1', [email]);
            const staff = result.rows[0];

            if (!staff) {
                return done(null, false, { message: 'Incorrect email' });
            }

            const isMatch = await bcrypt.compare(password, staff.password);


            if (!isMatch) {
                return done(null, false, { message: 'Incorrect password' });
            }

            return done(null, staff);
        }
        catch(err){
            return done(err);
        }
    }
));

passport.serializeUser((staff, done) => {
    done(null, staff.s_id);
});

passport.deserializeUser(async (s_id, done) => {
    try {
        const result = await pool.query('SELECT * FROM staff WHERE s_id = $1', [s_id]);
        done(null, result.rows[0]);
    } catch (err) {
        done(err);
    }
});

module.exports = passport;