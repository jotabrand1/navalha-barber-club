import { createDatabase } from "./db.js";
const db = await createDatabase();
try {
  await db.migrate();
  console.log("Database migration complete.");
} finally {
  await db.close();
}
