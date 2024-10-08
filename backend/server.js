const express = require("express");
const jwt = require("jsonwebtoken");

const authRouter = require("./routes/auth");
const apiRouter = require("./routes/api");
const proxyRouter = require("./routes/proxy");
const { router: syncRouter } = require("./routes/sync");
const statsRouter = require("./routes/stats");
const ActivityMonitor = require("./tasks/ActivityMonitor");
const SyncTask = require("./tasks/SyncTask");
const { router: logRouter } = require("./routes/logging");

const db = require("./db");
const path = require("path");

const http = require("http");

const app = express();

const PORT = process.env.PORT || 3003;
const LISTEN_IP = "127.0.0.1";
const JWT_SECRET = process.env.JWT_SECRET;

if (JWT_SECRET === undefined) {
  console.log("JWT Secret cannot be undefined");
  process.exit(1); // end the program with error status code
}

app.use(express.json()); // middleware to parse JSON request bodies

const server = http.createServer(app);
app.use(express.static(path.join(__dirname, "static")));

// JWT middleware
async function authenticate(req, res, next) {
  const token = req.headers.authorization;
  const apiKey = req.headers["x-api-token"] || req.query.apiKey;

  if (!token && !apiKey) {
    return res.status(401).json({
      message: "Authentication failed. No token or API key provided.",
    });
  }

  if (token) {
    const extracted_token = token.split(" ")[1];
    if (!extracted_token || extracted_token === "null") {
      return res.sendStatus(403);
    }

    try {
      const decoded = jwt.verify(extracted_token, JWT_SECRET);
      req.user = decoded.user;
    } catch (error) {
      console.log(error);
      return res.status(401).json({ message: "Invalid token" });
    }
    next();
  } else if (apiKey) {
    const keysjson = await dbInstance
      .query('SELECT api_keys FROM app_config where "ID"=1')
      .then((res) => res.rows[0].api_keys);

    if (!keysjson || Object.keys(keysjson).length === 0) {
      return res.status(404).json({ message: "No API keys configured" });
    }
    const keys = keysjson || [];

    const keyExists = keys.some((obj) => obj.key === apiKey);

    if (keyExists) {
      next();
    } else {
      return res.status(403).json({ message: "Invalid API key" });
    }
  }
}

app.use("/auth", authRouter); // mount the API router at /auth
app.use("/proxy", proxyRouter); // mount the API router at /proxy
app.use("/api", authenticate, apiRouter); // mount the API router at /api, with JWT middleware
app.use("/sync", authenticate, syncRouter); // mount the API router at /sync, with JWT middleware
app.use("/stats", authenticate, statsRouter); // mount the API router at /stats, with JWT middleware
app.use("/logs", authenticate, logRouter); // mount the API router at /logs, with JWT middleware

db.initDatabase().then(() => {
  server.listen(PORT, async () => {
    console.log(`Server listening on http://${LISTEN_IP}:${PORT}`);

    ActivityMonitor.ActivityMonitor(1000);
    SyncTask.SyncTask();
  });
});
