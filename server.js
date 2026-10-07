const express = require('express');
const app = express();
const cors = require('cors');
const session = require("express-session");
const passport = require("./src/config/passport");
const PatientRouter = require("./src/routes/PatientRouter.js");
const StaffRouter = require('./src/routes/StaffRouter.js');

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));


app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-for-development-stage',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24
  }
}));

app.use(passport.initialize());
app.use(passport.session());


app.use('/patients', PatientRouter);
app.use('/staff', StaffRouter);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`app is listening on port ${PORT}`);
});