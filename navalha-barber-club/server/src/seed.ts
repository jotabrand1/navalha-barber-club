import { createDatabase } from "./db.js";
import { seedDatabase } from "./seed-data.js";
const db = await createDatabase();
try {
  await db.migrate();
  await seedDatabase(db);
  console.log("Development demo data ready. Password: Navalha123!");
} finally {
  await db.close();
}
