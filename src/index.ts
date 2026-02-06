// Detect Railway environment
const isRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PROJECT_ID;

if (isRailway) {
  console.log("Running in Railway production mode");
}

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { StatusCode } from "hono/utils/http-status";
import { logger } from "hono/logger";

// Only load env validation in non-Railway environment
if (!isRailway) {
  require("./env");
}

// Import routes
import { authRouter } from "./routes/auth";
import { departmentsRouter } from "./routes/departments";
import { projectsRouter } from "./routes/projects";
import { beneficiariesRouter } from "./routes/beneficiaries";
import { newsRouter } from "./routes/news";
import { alertsRouter } from "./routes/alerts";
import { statsRouter } from "./routes/stats";
import { regionsRouter } from "./routes/regions";
import { sectorsRouter } from "./routes/sectors";
import { usersRouter } from "./routes/users";
import { messagesRouter } from "./routes/messages";
import { documentsRouter } from "./routes/documents";
import { milestonesRouter } from "./routes/milestones";
import { disbursementsRouter } from "./routes/disbursements";
import { reportsRouter } from "./routes/reports";
import { validationsRouter } from "./routes/validations";
import { notificationsRouter } from "./routes/notifications";
import { smsRouter } from "./routes/sms";
import { agentsRouter } from "./routes/agents";

const app = new Hono();

// CORS middleware - validates origin against allowlist
const allowed = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.dev\.vibecode\.run$/,
  /^https:\/\/[a-z0-9-]+\.vibecode\.run$/,
  /^https:\/\/[a-z0-9-]+\.vibecodeapp\.com$/,
  /^https:\/\/[a-z0-9-]+\.netlify\.app$/,
  /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/,
  /^https:\/\/[a-z0-9-]+\.railway\.app$/,
  /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/,
  /^https:\/\/(www\.)?menefphub\.com$/,
];

app.use(
  "*",
  cors({
    origin: (origin) => (origin && allowed.some((re) => re.test(origin)) ? origin : null),
    credentials: true,
  })
);

// Logging
app.use("*", logger());

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/api/health", (c) => c.json({ status: "ok" }));

// File upload endpoint - only available in Vibecode environment
if (!isRailway) {
  const { createVibecodeSDK, StorageError } = require("@vibecodeapp/backend-sdk");
  const vibecode = createVibecodeSDK();

  app.post("/api/upload", async (c) => {
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return c.json({ error: { message: "Aucun fichier fourni" } }, 400);
    }

    try {
      const result = await vibecode.storage.upload(file);
      return c.json({ data: result });
    } catch (error: any) {
      if (error instanceof StorageError) {
        return c.json({ error: { message: error.message } }, (error.statusCode || 500) as StatusCode);
      }
      return c.json({ error: { message: "Echec de l'upload" } }, 500);
    }
  });

  app.delete("/api/files/:id", async (c) => {
    const { id } = c.req.param();

    try {
      await vibecode.storage.delete(id);
      return c.json({ data: { success: true } });
    } catch (error: any) {
      if (error instanceof StorageError) {
        return c.json({ error: { message: error.message } }, (error.statusCode || 500) as StatusCode);
      }
      return c.json({ error: { message: "Echec de la suppression" } }, 500);
    }
  });
} else {
  // Placeholder endpoints for Railway
  app.post("/api/upload", (c) => c.json({ error: { message: "File upload not available in production" } }, 501));
  app.delete("/api/files/:id", (c) => c.json({ error: { message: "File delete not available in production" } }, 501));
}

// Mount routes
app.route("/api/auth", authRouter);
app.route("/api/departments", departmentsRouter);
app.route("/api/projects", projectsRouter);
app.route("/api/beneficiaries", beneficiariesRouter);
app.route("/api/news", newsRouter);
app.route("/api/alerts", alertsRouter);
app.route("/api/stats", statsRouter);
app.route("/api/regions", regionsRouter);
app.route("/api/sectors", sectorsRouter);
app.route("/api/users", usersRouter);
app.route("/api/messages", messagesRouter);
app.route("/api/documents", documentsRouter);
app.route("/api", milestonesRouter);
app.route("/api", disbursementsRouter);
app.route("/api/reports", reportsRouter);
app.route("/api/validations", validationsRouter);
app.route("/api/notifications", notificationsRouter);
app.route("/api/sms", smsRouter);
app.route("/api/agents", agentsRouter);

const port = Number(process.env.PORT) || 3000;

export default {
  port,
  fetch: app.fetch,
};
