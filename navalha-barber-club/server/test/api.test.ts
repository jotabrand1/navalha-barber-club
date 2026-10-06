import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createDatabase, type Database } from "../src/db.js";
import { createApp } from "../src/app.js";
import { seedDatabase } from "../src/seed-data.js";

const now = new Date("2026-10-06T08:00:00-03:00");
let db: Database;
let app: ReturnType<typeof createApp>;
let client: ReturnType<typeof request.agent>;
let barber: ReturnType<typeof request.agent>;
let admin: ReturnType<typeof request.agent>;
let clientId: string;
let barberId: string;
let serviceId: string;
let appointmentId: string;
const password = "Navalha123!";

before(async () => {
  db = await createDatabase({ engine: "pglite", dataDir: "memory://" });
  await db.migrate();
  await seedDatabase(db, now);
  app = createApp(db, { now: () => now, logger: () => {} });
  client = request.agent(app);
  barber = request.agent(app);
  admin = request.agent(app);
  const c = await client
    .post("/api/auth/login")
    .send({ email: "joao@email.com", password })
    .expect(200);
  const b = await barber
    .post("/api/auth/login")
    .send({ email: "marcos@navalha.com", password })
    .expect(200);
  await admin
    .post("/api/auth/login")
    .send({ email: "ana@navalha.com", password })
    .expect(200);
  clientId = c.body.user.id;
  barberId = b.body.user.id;
  const catalog = await client.get("/api/catalog").expect(200);
  serviceId = catalog.body.services.find(
    (service: any) => service.durationMinutes === 70,
  ).id;
});
after(async () => {
  await db.close();
});

test("authentication uses an HttpOnly cookie and never leaks hashes", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: "joao@email.com", password })
    .expect(200);
  assert.match(response.headers["set-cookie"][0], /HttpOnly/);
  assert.match(response.headers["set-cookie"][0], /SameSite=Lax/);
  assert.doesNotMatch(response.headers["set-cookie"][0], /Expires=/);
  assert.equal(response.body.user.password_hash, undefined);
  assert.equal(response.body.user.role, "client");
  await request(app).get("/api/appointments").expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "joao@email.com", password: "wrong" })
    .expect(401);
  await request(app)
    .post("/api/auth/login")
    .set("Origin", "https://untrusted.example")
    .send({ email: "joao@email.com", password })
    .expect(403);
  const logoutAgent = request.agent(app);
  await logoutAgent
    .post("/api/auth/login")
    .send({ email: "joao@email.com", password })
    .expect(200);
  await logoutAgent.post("/api/auth/logout").expect(200);
  await logoutAgent.get("/api/auth/me").expect(401);
  const remembered = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "JOAO@email.com", password, remember: true })
    .expect(200);
  assert.match(remembered.headers["set-cookie"][0], /Expires=/);
  const phone = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "11999991234", password, remember: false })
    .expect(200);
  assert.equal(phone.body.user.id, clientId);
  assert.doesNotMatch(phone.headers["set-cookie"][0], /Expires=/);
  await request(app)
    .post("/api/auth/login")
    .send({ identifier: "(11) 99999-1234", password })
    .expect(200);
});

test("registration validates input, normalizes email, and cannot grant staff roles", async () => {
  await request(app)
    .post("/api/auth/register")
    .send({
      name: "Hacker",
      email: "hacker@example.com",
      password,
      role: "admin",
    })
    .expect(400);
  await request(app)
    .post("/api/auth/register")
    .send({ name: "A", email: "bad", password: "123" })
    .expect(400);
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Cliente Teste",
      email: "TESTE@example.com",
      phone: "(11) 90000-1000",
      password,
    })
    .expect(201);
  assert.equal(response.body.user.email, "teste@example.com");
  assert.equal(response.body.user.role, "client");
  await request(app)
    .post("/api/auth/register")
    .send({ name: "Duplicado", email: "teste@example.com", password })
    .expect(409);
  assert.match(
    (
      await db.query("SELECT password_hash FROM users WHERE email=$1", [
        "teste@example.com",
      ])
    ).rows[0].password_hash,
    /^scrypt:/,
  );
});

test("roles protect administration and staff data", async () => {
  await client.get("/api/admin/overview").expect(403);
  await client.get("/api/admin/clients").expect(403);
  await client.get("/api/clients").expect(403);
  await client
    .post("/api/blocks")
    .send({
      startAt: "2026-10-08T09:00:00-03:00",
      endAt: "2026-10-08T10:00:00-03:00",
    })
    .expect(403);
  await barber.get("/api/admin/services").expect(403);
  const overview = await admin.get("/api/admin/overview").expect(200);
  assert.equal(overview.body.stats.barbers, 3);
  assert.ok(overview.body.stats.clients >= 6);
  assert.ok(overview.body.stats.revenueCents > 0);
  assert.ok(overview.body.revenueByMonth.length > 0);
  await barber.get("/api/clients").expect(200);
});

test("booking trusts server prices, enforces business time and prevents parallel overlap", async () => {
  const booking = { barberId, serviceId, startAt: "2026-10-07T09:00:00-03:00" };
  await client
    .post("/api/appointments")
    .send({ ...booking, priceCents: 1 })
    .expect(400);
  await client
    .post("/api/appointments")
    .send({ ...booking, startAt: "2026-10-04T09:00:00-03:00" })
    .expect(400);
  await client
    .post("/api/appointments")
    .send({ ...booking, startAt: "2026-10-11T09:00:00-03:00" })
    .expect(400);
  await client
    .post("/api/appointments")
    .send({ ...booking, startAt: "2026-10-07T18:30:00-03:00" })
    .expect(400);
  await client
    .post("/api/appointments")
    .send({ ...booking, startAt: "2026-10-07T09:10:00-03:00" })
    .expect(400);
  const responses = await Promise.all([
    client.post("/api/appointments").send(booking),
    client.post("/api/appointments").send(booking),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [201, 409],
  );
  const successful = responses.find((response) => response.status === 201)!;
  appointmentId = successful.body.appointment.id;
  assert.equal(successful.body.appointment.priceCents, 8900);
  assert.equal(successful.body.appointment.durationMinutes, 70);
  assert.equal(successful.body.appointment.clientId, clientId);
  assert.equal(successful.body.appointment.status, "confirmed");
  await client
    .post("/api/appointments")
    .send({ ...booking, startAt: "2026-10-07T09:30:00-03:00" })
    .expect(409);
  const availability = await client
    .get("/api/availability")
    .query({ date: "2026-10-07", barberId, serviceId })
    .expect(200);
  assert.ok(!availability.body.slots.includes("2026-10-07T12:00:00.000Z"));
  const exclude = await client
    .get("/api/availability")
    .query({
      date: "2026-10-07",
      barberId,
      serviceId,
      excludeAppointmentId: appointmentId,
    })
    .expect(200);
  assert.ok(exclude.body.slots.includes("2026-10-07T12:00:00.000Z"));
  await client
    .get("/api/availability")
    .query({ date: "2026-02-30", barberId, serviceId })
    .expect(400);
});

test("ownership and role restrictions apply to appointments and rescheduling", async () => {
  const other = request.agent(app);
  await other
    .post("/api/auth/login")
    .send({ email: "andre@email.com", password })
    .expect(200);
  await other
    .patch(`/api/appointments/${appointmentId}`)
    .send({ status: "cancelled" })
    .expect(403);
  await other
    .get("/api/availability")
    .query({
      date: "2026-10-07",
      barberId,
      serviceId,
      excludeAppointmentId: appointmentId,
    })
    .expect(403);
  await client
    .patch(`/api/appointments/${appointmentId}`)
    .send({ status: "completed" })
    .expect(403);
  await barber
    .patch(`/api/appointments/${appointmentId}`)
    .send({ startAt: "2026-10-08T09:00:00-03:00" })
    .expect(403);
  await barber
    .patch(`/api/appointments/${appointmentId}`)
    .send({ status: "completed" })
    .expect(400);
  const changed = await client
    .patch(`/api/appointments/${appointmentId}`)
    .send({ startAt: "2026-10-08T09:00:00-03:00" })
    .expect(200);
  assert.equal(changed.body.appointment.startAt, "2026-10-08T12:00:00.000Z");
  await client
    .patch(`/api/appointments/${appointmentId}`)
    .send({ status: "cancelled" })
    .expect(200);
  await client
    .patch(`/api/appointments/${appointmentId}`)
    .send({ status: "confirmed" })
    .expect(409);
  const listed = await client.get("/api/appointments").expect(200);
  assert.ok(
    listed.body.appointments.every(
      (appointment: any) => appointment.clientId === clientId,
    ),
  );
  const barberList = await barber.get("/api/appointments").expect(200);
  assert.ok(
    barberList.body.appointments.every(
      (appointment: any) => appointment.barberId === barberId,
    ),
  );
  const near = await client
    .post("/api/appointments")
    .send({ barberId, serviceId, startAt: "2026-10-06T09:00:00-03:00" })
    .expect(201);
  await client
    .patch(`/api/appointments/${near.body.appointment.id}`)
    .send({ status: "cancelled" })
    .expect(400);
});

test("Figma service durations and quarter-hour slots preserve exact overlap boundaries", async () => {
  const catalog = (await client.get("/api/catalog").expect(200)).body;
  assert.deepEqual(
    catalog.services.map((service: any) => [
      service.name,
      service.durationMinutes,
      service.priceCents,
    ]),
    [
      ["Corte clássico", 45, 5500],
      ["Barba premium", 35, 4500],
      ["Corte + barba", 70, 8900],
      ["Degradê", 50, 6500],
    ],
  );
  const beard = catalog.services.find(
    (service: any) => service.durationMinutes === 35,
  );
  const appointment = (
    await client
      .post("/api/appointments")
      .send({
        barberId,
        serviceId: beard.id,
        startAt: "2026-10-13T09:45:00-03:00",
      })
      .expect(201)
  ).body.appointment;
  assert.equal(appointment.durationMinutes, 35);
  assert.equal(appointment.startAt, "2026-10-13T12:45:00.000Z");
  await client
    .post("/api/appointments")
    .send({ barberId, serviceId, startAt: "2026-10-13T10:15:00-03:00" })
    .expect(409);
  const availability = (
    await client
      .get("/api/availability")
      .query({ barberId, serviceId, date: "2026-10-13" })
      .expect(200)
  ).body;
  assert.ok(!availability.slots.includes("2026-10-13T13:15:00.000Z"));
  assert.ok(availability.slots.includes("2026-10-13T13:30:00.000Z"));
  const next = (
    await client
      .post("/api/appointments")
      .send({ barberId, serviceId, startAt: "2026-10-13T10:30:00-03:00" })
      .expect(201)
  ).body.appointment;
  assert.equal(next.durationMinutes, 70);
});

test("blocks are scoped, remove availability and cannot overlap booked appointments", async () => {
  const response = await barber
    .post("/api/blocks")
    .send({
      startAt: "2026-10-09T09:00:00-03:00",
      endAt: "2026-10-09T10:00:00-03:00",
      reason: "Compromisso pessoal",
    })
    .expect(201);
  const block = response.body.block;
  assert.equal(block.barberId, barberId);
  await client
    .post("/api/appointments")
    .send({ barberId, serviceId, startAt: "2026-10-09T09:00:00-03:00" })
    .expect(409);
  const availability = await client
    .get("/api/availability")
    .query({ date: "2026-10-09", barberId, serviceId })
    .expect(200);
  assert.ok(!availability.body.slots.includes("2026-10-09T12:00:00.000Z"));
  const otherBarber = request.agent(app);
  await otherBarber
    .post("/api/auth/login")
    .send({ email: "lucas@navalha.com", password })
    .expect(200);
  await otherBarber.delete(`/api/blocks/${block.id}`).expect(404);
  await barber.delete(`/api/blocks/${block.id}`).expect(200);
  await barber
    .post("/api/blocks")
    .send({
      startAt: "2026-10-06T09:00:00-03:00",
      endAt: "2026-10-06T10:00:00-03:00",
    })
    .expect(409);
});

test("admin CRUD validates catalog, preserves historic prices, and revokes disabled users", async () => {
  await admin
    .post("/api/admin/services")
    .send({ name: "Inválido", durationMinutes: 10, priceCents: -10 })
    .expect(400);
  const service = (
    await admin
      .post("/api/admin/services")
      .send({
        name: "Tratamento de teste",
        durationMinutes: 30,
        priceCents: 5500,
      })
      .expect(201)
  ).body.service;
  await admin
    .patch(`/api/admin/services/${service.id}`)
    .send({ priceCents: 6500, description: "Nova descrição" })
    .expect(200);
  const appointment = (
    await client
      .post("/api/appointments")
      .send({
        barberId,
        serviceId: service.id,
        startAt: "2026-10-10T09:00:00-03:00",
      })
      .expect(201)
  ).body.appointment;
  await admin
    .patch(`/api/admin/services/${service.id}`)
    .send({ priceCents: 8000 })
    .expect(200);
  assert.equal(
    (
      await db.query("SELECT price_cents FROM appointments WHERE id=$1", [
        appointment.id,
      ])
    ).rows[0].price_cents,
    6500,
  );
  await admin.delete(`/api/admin/services/${service.id}`).expect(200);
  await client
    .post("/api/appointments")
    .send({
      barberId,
      serviceId: service.id,
      startAt: "2026-10-10T09:30:00-03:00",
    })
    .expect(404);
  const person = (
    await admin
      .post("/api/admin/clients")
      .send({ name: "Cliente CRUD", email: "crud@example.com", password })
      .expect(201)
  ).body.user;
  const personAgent = request.agent(app);
  await personAgent
    .post("/api/auth/login")
    .send({ email: "crud@example.com", password })
    .expect(200);
  await admin
    .patch(`/api/admin/clients/${person.id}`)
    .send({ name: "Cliente Atualizado" })
    .expect(200);
  const searched = await admin
    .get("/api/admin/clients")
    .query({ search: "Atualizado" })
    .expect(200);
  assert.equal(searched.body.clients[0].id, person.id);
  await admin.delete(`/api/admin/clients/${person.id}`).expect(200);
  await personAgent.get("/api/auth/me").expect(401);
  await personAgent
    .post("/api/auth/login")
    .send({ email: "crud@example.com", password })
    .expect(401);
  const staffAppointment = await admin
    .post("/api/appointments")
    .send({
      clientId,
      barberId,
      serviceId,
      startAt: "2026-10-12T09:00:00-03:00",
    })
    .expect(201);
  const otherBarber = (
    await admin.get("/api/admin/barbers").expect(200)
  ).body.barbers.find((item: any) => item.id !== barberId);
  await barber
    .post("/api/appointments")
    .send({
      clientId,
      barberId: otherBarber.id,
      serviceId,
      startAt: "2026-10-12T09:00:00-03:00",
    })
    .expect(403);
  await admin
    .patch(`/api/admin/barbers/${barberId}`)
    .send({ active: false })
    .expect(200);
  await client
    .patch(`/api/appointments/${staffAppointment.body.appointment.id}`)
    .send({ startAt: "2026-10-13T09:00:00-03:00" })
    .expect(409);
  await admin
    .patch(`/api/admin/barbers/${barberId}`)
    .send({ active: true })
    .expect(200);
});

test("password reset is one use, expires, and revokes previous sessions", async () => {
  const resetAgent = request.agent(app);
  await resetAgent
    .post("/api/auth/login")
    .send({ email: "teste@example.com", password })
    .expect(200);
  const reset = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "teste@example.com" })
    .expect(200);
  assert.equal(reset.body.delivery, "development");
  assert.equal(new URL(reset.body.resetUrl).pathname, "/redefinir");
  const token = new URL(reset.body.resetUrl).searchParams.get("token");
  await request(app)
    .post("/api/auth/reset-password")
    .send({ token, password: "NovaSenha123!" })
    .expect(200);
  await resetAgent.get("/api/auth/me").expect(401);
  await request(app)
    .post("/api/auth/reset-password")
    .send({ token, password: "NovaSenha123!" })
    .expect(400);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "teste@example.com", password })
    .expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "teste@example.com", password: "NovaSenha123!" })
    .expect(200);
  const expires = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "teste@example.com" })
    .expect(200);
  await db.query(
    "UPDATE password_reset_tokens SET expires_at='2026-10-01T00:00:00Z'",
  );
  await request(app)
    .post("/api/auth/reset-password")
    .send({
      token: new URL(expires.body.resetUrl).searchParams.get("token"),
      password,
    })
    .expect(400);
  const prodApp = createApp(db, { production: true, logger: () => {} });
  const prod = await request(prodApp)
    .post("/api/auth/forgot-password")
    .send({ email: "teste@example.com" })
    .expect(200);
  assert.equal(prod.body.delivery, "unconfigured");
  assert.equal(prod.body.resetUrl, undefined);
});

test("embedded PostgreSQL persists data across database restarts", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "navalha-persistence-"),
  );
  assert.ok(
    path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep),
  );
  let persistent = await createDatabase({
    engine: "pglite",
    dataDir: directory,
  });
  try {
    await persistent.migrate();
    await persistent.query(
      "INSERT INTO services (id,name,duration_minutes,price_cents) VALUES ('11111111-1111-4111-8111-111111111111','Persistente',30,4500)",
    );
    await persistent.close();
    persistent = await createDatabase({ engine: "pglite", dataDir: directory });
    assert.equal(
      (
        await persistent.query(
          "SELECT name FROM services WHERE id='11111111-1111-4111-8111-111111111111'",
        )
      ).rows[0].name,
      "Persistente",
    );
  } finally {
    await persistent.close();
    await rm(directory, { recursive: true, force: true });
  }
});
