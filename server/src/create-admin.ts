import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createDatabase } from "./db.js";
import { hashPassword } from "./security.js";

// Explicit bootstrap: privileged accounts are never created by public registration.
const input = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z
      .string()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z
      .string()
      .min(12, "Use at least 12 characters for the administrator password.")
      .max(128)
      .regex(/[A-Za-z]/)
      .regex(/\d/),
  })
  .parse({
    name: process.env.ADMIN_NAME ?? "Administrador",
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
const db = await createDatabase();
try {
  await db.migrate();
  await db.query(
    "INSERT INTO users (id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,$5)",
    [
      randomUUID(),
      input.name,
      input.email,
      await hashPassword(input.password),
      "admin",
    ],
  );
  console.log(`Administrator created: ${input.email}`);
} finally {
  await db.close();
}
