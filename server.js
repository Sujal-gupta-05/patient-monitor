const express = require('express');
const app = express();
const cors = require('cors');
const session = require("express-session");
const passport = require("./src/config/passport");
const PatientRouter = require("./src/routes/PatientRouter.js");
const StaffRouter = require('./src/routes/StaffRouter.js');
const AlertRouter = require("./src/routes/AlertRouter.js");
const RiskRuleRouter = require("./src/routes/RiskRuleRouter");

const errorHandler = require("./src/middleware/errorHandler");

const { createClient } = require("redis");
const { RedisStore } = require("connect-redis");

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379"
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err);
});


app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));


app.use(express.json());

app.use(session({
  store: new RedisStore({
    client: redisClient,
    prefix: "patient-monitor:sess:"
  }),
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
app.use('/alerts', AlertRouter);
app.use("/risk-rules", RiskRuleRouter);

app.use(errorHandler);

const PORT = process.env.PORT || 8080;


async function startServer(){
  try{
    await redisClient.connect();

    app.listen(PORT, () => {
      console.log(`app is listening on port ${PORT}`);
    });
  }
  catch(err){
    console.error("Failed to connect Redis: ", err);
    process.exit(1);
  }
}

startServer();
