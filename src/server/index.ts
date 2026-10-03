import { createServer } from "node:http";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import express from "express";
import { createDatabase } from "../db/database.js";
import { createApp, errorHandler } from "./app.js";
import { workPublishing } from "../publishing/service.js";
import { workOne } from "../automation/engine.js";
if (existsSync(".env")) loadEnvFile(".env");
const port = Number(process.env.PORT || 3000),
  appUrl = process.env.APP_URL || `http://localhost:${port}`;
if (
  process.env.NODE_ENV === "production" &&
  !/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || "")
)
  throw new Error("Production requires DATABASE_URL pointing to PostgreSQL.");
const db = await createDatabase(process.env.DATABASE_URL);
const app = createApp(db, appUrl);
const server = createServer(app);
let closePreview: (() => Promise<void>) | undefined;
if (process.env.NODE_ENV !== "production") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
  closePreview = () => vite.close();
} else {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
app.use(errorHandler);
let running = false,
  stopping = false;
let activeWork: Promise<void> = Promise.resolve();
const timer = setInterval(async () => {
  if (running || stopping) return;
  running = true;
  activeWork = (async () => {
    try {
      for (let i = 0; i < 7 && !stopping; i++)
        if (!(await workPublishing(db))) break;
      for (let i = 0; i < 10 && !stopping; i++)
        if (!(await workOne(db, appUrl))) break;
    } catch {
      console.error(JSON.stringify({ errorCode: "WORKER_FAILED" }));
    } finally {
      running = false;
    }
  })();
  await activeWork;
}, 500);
server.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Relay available at ${appUrl}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    // SSE connections must not keep the process alive through watch restarts.
    server.close();
    server.closeAllConnections();
    void (async () => {
      await closePreview?.();
      await activeWork;
      await db.close();
      process.exit(0);
    })();
  });
