import { randomUUID } from "node:crypto";
import type { Database } from "./db.js";
import { hashPassword } from "./security.js";
import { localDate } from "./time.js";

// Development data only. Never install public demo credentials in production.
export async function seedDatabase(db: Database, today = new Date()) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo seed is disabled in production.");
  const passwordHash = await hashPassword("Navalha123!");
  await db.transaction(async (tx) => {
    const people = [
      ["João Victor", "joao@email.com", "(11) 99999-1234", "client", "", ""],
      [
        "Marcos Oliveira",
        "marcos@navalha.com",
        "(11) 99999-5678",
        "barber",
        "Cortes clássicos e barba",
        "Mais de 10 anos dedicados ao corte perfeito. Especialista em degradê e barba tradicional.",
      ],
      [
        "Lucas Mendes",
        "lucas@navalha.com",
        "(11) 99999-1122",
        "barber",
        "Degradê e visagismo",
        "Estilo, precisão e atenção aos detalhes em cada atendimento.",
      ],
      [
        "Rafael Costa",
        "rafael@navalha.com",
        "(11) 99999-3344",
        "barber",
        "Cortes modernos",
        "Cortes modernos para valorizar a sua personalidade.",
      ],
      ["Ana Martins", "ana@navalha.com", "(11) 99999-7788", "admin", "", ""],
      ["André Lima", "andre@email.com", "(11) 98888-1001", "client", "", ""],
      ["Bruno Souza", "bruno@email.com", "(11) 98888-1002", "client", "", ""],
      ["Caio Martins", "caio@email.com", "(11) 98888-1003", "client", "", ""],
      [
        "Eduardo Nunes",
        "eduardo@email.com",
        "(11) 98888-1004",
        "client",
        "",
        "",
      ],
      ["Felipe Rocha", "felipe@email.com", "(11) 98888-1005", "client", "", ""],
    ];
    for (const [name, email, phone, role, specialty, bio] of people) {
      await tx.query(
        "INSERT INTO users (id,name,email,phone,password_hash,role,specialty,bio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (email) DO NOTHING",
        [randomUUID(), name, email, phone, passwordHash, role, specialty, bio],
      );
    }
    const catalog = [
      [
        "Corte clássico",
        "Corte personalizado com acabamento impecável.",
        45,
        5500,
      ],
      [
        "Barba premium",
        "Barba desenhada com toalha quente e navalha.",
        35,
        4500,
      ],
      [
        "Corte + barba",
        "Uma experiência completa para renovar seu estilo.",
        70,
        8900,
      ],
      [
        "Degradê",
        "Degradê preciso com transição suave e acabamento.",
        50,
        6500,
      ],
    ] as const;
    for (const [
      order,
      [name, description, duration, price],
    ] of catalog.entries()) {
      await tx.query(
        "INSERT INTO services (id,name,description,duration_minutes,price_cents,sort_order) SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS (SELECT 1 FROM services WHERE name=$2)",
        [randomUUID(), name, description, duration, price, order],
      );
      await tx.query("UPDATE services SET sort_order=$1 WHERE name=$2", [
        order,
        name,
      ]);
    }
    if ((await tx.query("SELECT id FROM appointments LIMIT 1")).rows.length)
      return;
    const users = (await tx.query("SELECT id,email,role FROM users")).rows;
    const services = (
      await tx.query(
        "SELECT * FROM services ORDER BY duration_minutes,price_cents",
      )
    ).rows;
    const clients = users.filter((user) => user.role === "client");
    const barbers = users.filter((user) => user.role === "barber");
    const date = localDate(today);
    const base = new Date(`${date}T12:00:00-03:00`);
    // Populate six weeks of revenue and several upcoming slots for a useful demo.
    for (let dayOffset = -35; dayOffset <= 5; dayOffset++) {
      const day = new Date(base.getTime() + dayOffset * 86_400_000);
      if (day.getUTCDay() === 0) continue;
      const dayString = localDate(day);
      for (let index = 0; index < (dayOffset < 0 ? 2 : 3); index++) {
        const service = services[(dayOffset + 42 + index) % services.length];
        const client = clients[(dayOffset + 42 + index) % clients.length];
        const barber = barbers[index % barbers.length];
        const hour = 11 + index * 2;
        const start = new Date(
          `${dayString}T${String(hour).padStart(2, "0")}:00:00-03:00`,
        );
        const status =
          start < today ? "completed" : index === 1 ? "pending" : "confirmed";
        await tx.query(
          "INSERT INTO appointments (id,client_id,barber_id,service_id,start_at,duration_minutes,price_cents,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            randomUUID(),
            client.id,
            barber.id,
            service.id,
            start,
            service.duration_minutes,
            service.price_cents,
            status,
          ],
        );
      }
    }
  });
}
