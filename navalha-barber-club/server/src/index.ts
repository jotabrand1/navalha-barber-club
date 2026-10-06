import "dotenv/config";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { createDatabase } from "./db.js";
import { createApp } from "./app.js";
import { seedDatabase } from "./seed-data.js";

const db = await createDatabase();
await db.migrate();
if (process.env.AUTO_SEED === "true") await seedDatabase(db);
const app = createApp(db);
// A built React client can be served by Node with npm start.
const clientDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist",
);
if (existsSync(path.join(clientDirectory, "index.html"))) {
  app.use(express.static(clientDirectory));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(clientDirectory, "index.html")),
  );
}
const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, () =>
  console.log(`Navalha API ready at http://localhost:${port} (${db.engine}).`),
);
const shutdown = () =>
  server.close(() => {
    void db.close().then(() => process.exit(0));
  });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
