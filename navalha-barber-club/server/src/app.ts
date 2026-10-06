import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import type { Database, Queryable, Row } from "./db.js";
import {
  createToken,
  hashPassword,
  tokenHash,
  verifyPassword,
} from "./security.js";
import { businessSlots, localDate, validBusinessStart } from "./time.js";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const id = z.string().uuid("Identificador inválido.");
const name = z
  .string()
  .trim()
  .min(2, "Informe pelo menos 2 caracteres.")
  .max(120);
const email = z
  .string()
  .trim()
  .email("E-mail inválido.")
  .max(254)
  .transform((value) => value.toLowerCase());
const phone = z
  .string()
  .trim()
  .max(25)
  .regex(/^[+\d\s().-]*$/, "Telefone inválido.");
const password = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(128)
  .regex(/[A-Za-z]/, "Inclua uma letra na senha.")
  .regex(/\d/, "Inclua um número na senha.");
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00-03:00`);
    return Number.isFinite(parsed.getTime()) && localDate(parsed) === value;
  }, "Data inválida.");
const startAt = z
  .string()
  .datetime({ offset: true, message: "Horário inválido." });
const notes = z.string().trim().max(1000);
const userColumns =
  'id, name, email, phone, role, specialty, bio, active, created_at AS "createdAt"';
const serviceColumns =
  'id, name, description, duration_minutes AS "durationMinutes", price_cents AS "priceCents", active, created_at AS "createdAt"';
const appointmentSelect = `SELECT a.id, a.client_id AS "clientId", c.name AS "clientName", c.email AS "clientEmail", c.phone AS "clientPhone",
  a.barber_id AS "barberId", b.name AS "barberName", a.service_id AS "serviceId", s.name AS "serviceName",
  a.start_at AS "startAt", a.duration_minutes AS "durationMinutes", a.price_cents AS "priceCents", a.status, a.notes
  FROM appointments a JOIN users c ON c.id=a.client_id JOIN users b ON b.id=a.barber_id JOIN services s ON s.id=a.service_id`;
const blocksSelect =
  'SELECT id, barber_id AS "barberId", start_at AS "startAt", end_at AS "endAt", reason FROM time_blocks';
const requireUser = (_req: Request, res: Response, next: NextFunction) => {
  if (!res.locals.user)
    return next(new HttpError(401, "Entre na sua conta para continuar."));
  next();
};
const roles =
  (...allowed: string[]) =>
  (_req: Request, res: Response, next: NextFunction) => {
    if (!allowed.includes(res.locals.user?.role))
      return next(new HttpError(403, "Você não tem permissão para esta ação."));
    next();
  };
function sessionCookie(req: Request): string | undefined {
  const raw = req.headers.cookie
    ?.split(";")
    .find((part) => part.trim().startsWith("navalha_session="));
  return raw?.trim().slice("navalha_session=".length);
}
function parseId(value: unknown): string {
  return id.parse(value);
}

export function createApp(
  db: Database,
  options: {
    now?: () => Date;
    origin?: string;
    production?: boolean;
    logger?: (message: string) => void;
  } = {},
) {
  const app = express();
  const now = options.now ?? (() => new Date());
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const origins = (
    options.origin ??
    process.env.APP_ORIGIN ??
    "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3001,http://localhost:3001"
  )
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""));
  const log = options.logger ?? console.log;
  const attempts = new Map<string, { count: number; until: number }>();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    const sameOrigin = `${req.protocol}://${req.get("host")}`;
    if (origin && !origins.includes(origin) && origin !== sameOrigin)
      return next(new HttpError(403, "Origem da solicitação não autorizada."));
    if (origin && origins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PATCH,DELETE,OPTIONS",
      );
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.use(async (req, res, next) => {
    const token = sessionCookie(req);
    if (token && /^[A-Za-z\d_-]{43}$/.test(token)) {
      const result = await db.query(
        `SELECT ${userColumns
          .split(", ")
          .map((column) => `u.${column}`)
          .join(", ")}
        FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at > $2 AND u.active=true`,
        [tokenHash(token), now()],
      );
      res.locals.user = result.rows[0];
    }
    next();
  });
  const limitAuth = (req: Request, _res: Response, next: NextFunction) => {
    const time = Date.now();
    for (const [key, attempt] of attempts)
      if (attempt.until <= time) attempts.delete(key);
    const key = `${req.ip}:${req.path}`;
    const attempt = attempts.get(key) ?? {
      count: 0,
      until: time + 15 * 60_000,
    };
    attempt.count += 1;
    if (attempts.size > 10_000) attempts.delete(attempts.keys().next().value!);
    attempts.set(key, attempt);
    if (attempt.count > 20)
      return next(
        new HttpError(429, "Muitas tentativas. Tente novamente em 15 minutos."),
      );
    next();
  };
  async function issueSession(res: Response, userId: string, remember = false) {
    const token = createToken();
    const sessionDays = Math.max(
      1,
      Math.min(30, Number(process.env.SESSION_DAYS) || 7),
    );
    const expiry = new Date(now().getTime() + sessionDays * 86_400_000);
    await db.query("DELETE FROM sessions WHERE expires_at <= $1", [now()]);
    await db.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)",
      [tokenHash(token), userId, expiry],
    );
    res.cookie("navalha_session", token, {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
      ...(remember ? { expires: expiry } : {}),
    });
  }
  async function getAppointment(queryable: Queryable, appointmentId: string) {
    return (
      await queryable.query(`${appointmentSelect} WHERE a.id=$1`, [
        appointmentId,
      ])
    ).rows[0];
  }
  async function lockDay(tx: Queryable, barberId: string, date: string) {
    if (db.engine === "postgres")
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${barberId}:${date}`,
      ]);
  }
  async function assertFree(
    tx: Queryable,
    barberId: string,
    start: string,
    duration: number,
    ignoreId?: string,
  ) {
    const end = new Date(
      new Date(start).getTime() + duration * 60_000,
    ).toISOString();
    const conflict = await tx.query(
      `SELECT id FROM appointments WHERE barber_id=$1 AND status <> 'cancelled'
      AND start_at < $3::timestamptz AND start_at + duration_minutes * interval '1 minute' > $2::timestamptz
      AND ($4::uuid IS NULL OR id<>$4::uuid) LIMIT 1`,
      [barberId, start, end, ignoreId ?? null],
    );
    const blocked = await tx.query(
      "SELECT id FROM time_blocks WHERE barber_id=$1 AND start_at < $3::timestamptz AND end_at > $2::timestamptz LIMIT 1",
      [barberId, start, end],
    );
    if (conflict.rows.length || blocked.rows.length)
      throw new HttpError(
        409,
        "Este horário acabou de ficar indisponível. Escolha outro.",
      );
  }
  function appointmentAccess(user: Row, appointment: Row) {
    if (
      (user.role === "client" && appointment.clientId !== user.id) ||
      (user.role === "barber" && appointment.barberId !== user.id)
    )
      throw new HttpError(403, "Você não tem acesso a este agendamento.");
  }

  app.get("/api/health", async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ status: "ok", database: db.engine });
  });
  app.post("/api/auth/register", limitAuth, async (req, res) => {
    const input = z
      .object({ name, email, phone: phone.default(""), password })
      .strict()
      .parse(req.body);
    const userId = randomUUID();
    const hash = await hashPassword(input.password);
    const { rows } = await db.query(
      `INSERT INTO users (id,name,email,phone,password_hash,role) VALUES ($1,$2,$3,$4,$5,'client') RETURNING ${userColumns}`,
      [userId, input.name, input.email, input.phone, hash],
    );
    await issueSession(res, userId);
    res.status(201).json({ user: rows[0] });
  });
  app.post("/api/auth/login", limitAuth, async (req, res) => {
    const input = z
      .object({
        identifier: z.string().trim().min(3).max(254).optional(),
        email: email.optional(),
        password: z.string().min(1).max(128),
        remember: z.boolean().default(false),
      })
      .strict()
      .refine(
        (value) => Boolean(value.identifier || value.email),
        "Informe seu e-mail ou telefone.",
      )
      .parse(req.body);
    const identifier = input.identifier ?? input.email!;
    const digits = identifier.replace(/\D/g, "");
    if (!identifier.includes("@") && digits.length < 10)
      throw new HttpError(401, "E-mail, telefone ou senha incorretos.");
    const { rows } = identifier.includes("@")
      ? await db.query("SELECT * FROM users WHERE email=$1 AND active=true", [
          identifier.toLowerCase(),
        ])
      : await db.query(
          "SELECT * FROM users WHERE regexp_replace(phone, '[^0-9]', '', 'g')=$1 AND active=true",
          [digits],
        );
    const account = rows[0];
    if (
      rows.length !== 1 ||
      !account ||
      !(await verifyPassword(input.password, account.password_hash))
    )
      throw new HttpError(401, "E-mail, telefone ou senha incorretos.");
    const token = sessionCookie(req);
    if (token)
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        tokenHash(token),
      ]);
    await issueSession(res, account.id, input.remember);
    const { password_hash: _hash, created_at: createdAt, ...user } = account;
    res.json({ user: { ...user, createdAt } });
  });
  app.post("/api/auth/logout", async (req, res) => {
    const token = sessionCookie(req);
    if (token)
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        tokenHash(token),
      ]);
    res.clearCookie("navalha_session", {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
    });
    res.json({ message: "Você saiu da sua conta." });
  });
  app.get("/api/auth/me", requireUser, (_req, res) =>
    res.json({ user: res.locals.user }),
  );
  app.patch("/api/auth/me", requireUser, async (req, res) => {
    const input = z
      .object({
        name: name.optional(),
        email: email.optional(),
        phone: phone.optional(),
      })
      .strict()
      .refine(
        (value) => Object.keys(value).length > 0,
        "Informe ao menos um campo.",
      )
      .parse(req.body);
    const user = res.locals.user;
    const result = await db.query(
      `UPDATE users SET name=$1,email=$2,phone=$3 WHERE id=$4 RETURNING ${userColumns}`,
      [
        input.name ?? user.name,
        input.email ?? user.email,
        input.phone ?? user.phone,
        user.id,
      ],
    );
    res.json({ user: result.rows[0] });
  });
  app.post("/api/auth/forgot-password", limitAuth, async (req, res) => {
    const input = z.object({ email }).strict().parse(req.body);
    const user = (
      await db.query("SELECT id FROM users WHERE email=$1 AND active=true", [
        input.email,
      ])
    ).rows[0];
    let resetUrl: string | undefined;
    if (user && !production) {
      const token = createToken();
      await db.transaction(async (tx) => {
        await tx.query(
          "DELETE FROM password_reset_tokens WHERE user_id=$1 OR expires_at <= $2",
          [user.id, now()],
        );
        await tx.query(
          "INSERT INTO password_reset_tokens (token_hash,user_id,expires_at) VALUES ($1,$2,$3)",
          [tokenHash(token), user.id, new Date(now().getTime() + 30 * 60_000)],
        );
      });
      resetUrl = `${origins[0]}/redefinir?token=${encodeURIComponent(token)}`;
      log(`Development password reset (30 minutes): ${resetUrl}`);
    }
    res.json({
      message: production
        ? "O envio de e-mail ainda não está configurado. Entre em contato com a barbearia para recuperar o acesso."
        : "Ambiente de demonstração: o link de recuperação fica disponível nesta tela e no servidor, quando a conta existe.",
      delivery: production ? "unconfigured" : "development",
      ...(resetUrl ? { resetUrl } : {}),
    });
  });
  app.post("/api/auth/reset-password", limitAuth, async (req, res) => {
    const input = z
      .object({ token: z.string().min(40).max(100), password })
      .strict()
      .parse(req.body);
    const hash = await hashPassword(input.password);
    await db.transaction(async (tx) => {
      const reset = (
        await tx.query(
          "SELECT * FROM password_reset_tokens WHERE token_hash=$1 AND expires_at > $2 FOR UPDATE",
          [tokenHash(input.token), now()],
        )
      ).rows[0];
      if (!reset)
        throw new HttpError(
          400,
          "Este link é inválido ou expirou. Solicite outro.",
        );
      await tx.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        hash,
        reset.user_id,
      ]);
      await tx.query("DELETE FROM sessions WHERE user_id=$1", [reset.user_id]);
      await tx.query("DELETE FROM password_reset_tokens WHERE user_id=$1", [
        reset.user_id,
      ]);
    });
    res.json({ message: "Senha atualizada. Entre com a nova senha." });
  });
  app.get("/api/catalog", async (_req, res) => {
    const services = await db.query(
      `SELECT ${serviceColumns} FROM services WHERE active=true ORDER BY sort_order,created_at,name`,
    );
    const barbers = await db.query(
      `SELECT id,name,specialty,bio FROM users WHERE role='barber' AND active=true ORDER BY name`,
    );
    res.json({
      services: services.rows,
      barbers: barbers.rows.map((barber) => ({
        ...barber,
        initials: barber.name
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((part: string) => part[0])
          .join("")
          .toUpperCase(),
      })),
    });
  });
  app.use("/api", requireUser);
  app.get("/api/availability", async (req, res) => {
    const input = z
      .object({
        date: dateSchema,
        barberId: id,
        serviceId: id,
        excludeAppointmentId: id.optional(),
      })
      .parse(req.query);
    if (input.excludeAppointmentId) {
      const current = await getAppointment(db, input.excludeAppointmentId);
      if (!current) throw new HttpError(404, "Agendamento não encontrado.");
      appointmentAccess(res.locals.user, current);
    }
    const service = (
      await db.query(
        "SELECT duration_minutes FROM services WHERE id=$1 AND active=true",
        [input.serviceId],
      )
    ).rows[0];
    const barber = (
      await db.query(
        "SELECT id FROM users WHERE id=$1 AND role='barber' AND active=true",
        [input.barberId],
      )
    ).rows[0];
    if (!service || !barber)
      throw new HttpError(404, "Serviço ou profissional indisponível.");
    const start = `${input.date}T00:00:00-03:00`;
    const end = new Date(new Date(start).getTime() + 86_400_000);
    const appointments = await db.query(
      "SELECT start_at, duration_minutes FROM appointments WHERE barber_id=$1 AND status<>'cancelled' AND start_at >= $2 AND start_at < $3 AND ($4::uuid IS NULL OR id<>$4::uuid)",
      [input.barberId, start, end, input.excludeAppointmentId ?? null],
    );
    const blocks = await db.query(
      "SELECT start_at,end_at FROM time_blocks WHERE barber_id=$1 AND start_at < $3 AND end_at > $2",
      [input.barberId, start, end],
    );
    const slots = businessSlots(
      input.date,
      service.duration_minutes,
      now(),
    ).filter((slot) => {
      const time = new Date(slot).getTime();
      const finish = time + service.duration_minutes * 60_000;
      return (
        !appointments.rows.some(
          (item) =>
            time <
              new Date(item.start_at).getTime() +
                item.duration_minutes * 60_000 &&
            finish > new Date(item.start_at).getTime(),
        ) &&
        !blocks.rows.some(
          (item) =>
            time < new Date(item.end_at).getTime() &&
            finish > new Date(item.start_at).getTime(),
        )
      );
    });
    res.json({ slots });
  });
  async function listAppointments(req: Request, user: Row, admin = false) {
    const input = z
      .object({
        date: dateSchema.optional(),
        from: dateSchema.optional(),
        to: dateSchema.optional(),
        status: z
          .enum(["pending", "confirmed", "completed", "cancelled"])
          .optional(),
        barberId: id.optional(),
      })
      .parse(req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      clauses.push(clause.replace("?", `$${params.length}`));
    };
    if (!admin && user.role === "client") add("a.client_id=?", user.id);
    if (!admin && user.role === "barber") add("a.barber_id=?", user.id);
    if (input.barberId) add("a.barber_id=?", input.barberId);
    if (input.status) add("a.status=?", input.status);
    if (input.date || input.from)
      add(
        "a.start_at>=?::timestamptz",
        `${input.date ?? input.from}T00:00:00-03:00`,
      );
    if (input.date || input.to)
      add(
        "a.start_at < ?::timestamptz",
        new Date(
          new Date(`${input.date ?? input.to}T00:00:00-03:00`).getTime() +
            86_400_000,
        ),
      );
    return (
      await db.query(
        `${appointmentSelect}${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY a.start_at DESC LIMIT 1000`,
        params,
      )
    ).rows;
  }
  app.get("/api/appointments", async (req, res) =>
    res.json({ appointments: await listAppointments(req, res.locals.user) }),
  );
  app.post("/api/appointments", async (req, res) => {
    const input = z
      .object({
        barberId: id,
        serviceId: id,
        startAt,
        notes: notes.default(""),
        clientId: id.optional(),
      })
      .strict()
      .parse(req.body);
    const user = res.locals.user;
    if (user.role === "client" && input.clientId && input.clientId !== user.id)
      throw new HttpError(403, "Você só pode agendar para sua própria conta.");
    if (user.role === "barber" && input.barberId !== user.id)
      throw new HttpError(403, "Você só pode agendar para sua própria agenda.");
    const clientId = user.role === "client" ? user.id : input.clientId;
    if (!clientId) throw new HttpError(400, "Selecione um cliente.");
    const appointment = await db.transaction(async (tx) => {
      const service = (
        await tx.query(
          "SELECT * FROM services WHERE id=$1 AND active=true FOR SHARE",
          [input.serviceId],
        )
      ).rows[0];
      const barber = (
        await tx.query(
          "SELECT id FROM users WHERE id=$1 AND active=true AND role='barber' FOR SHARE",
          [input.barberId],
        )
      ).rows[0];
      const client = (
        await tx.query(
          "SELECT id FROM users WHERE id=$1 AND active=true AND role='client' FOR SHARE",
          [clientId],
        )
      ).rows[0];
      if (!service || !barber || !client)
        throw new HttpError(
          404,
          "Cliente, serviço ou profissional indisponível.",
        );
      if (!validBusinessStart(input.startAt, service.duration_minutes, now()))
        throw new HttpError(
          400,
          "Escolha um horário futuro, entre 9h e 19h, de segunda a sábado.",
        );
      await lockDay(tx, input.barberId, localDate(new Date(input.startAt)));
      await assertFree(
        tx,
        input.barberId,
        input.startAt,
        service.duration_minutes,
      );
      const appointmentId = randomUUID();
      await tx.query(
        "INSERT INTO appointments (id,client_id,barber_id,service_id,start_at,duration_minutes,price_cents,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          appointmentId,
          clientId,
          input.barberId,
          input.serviceId,
          input.startAt,
          service.duration_minutes,
          service.price_cents,
          input.notes,
        ],
      );
      return getAppointment(tx, appointmentId);
    });
    res.status(201).json({ appointment });
  });
  app.patch("/api/appointments/:id", async (req, res) => {
    const appointmentId = parseId(req.params.id);
    const input = z
      .object({
        status: z
          .enum(["pending", "confirmed", "completed", "cancelled"])
          .optional(),
        startAt: startAt.optional(),
      })
      .strict()
      .refine(
        (value) => Object.keys(value).length > 0,
        "Informe uma alteração.",
      )
      .parse(req.body);
    const user = res.locals.user;
    const appointment = await db.transaction(async (tx) => {
      const locked = (
        await tx.query("SELECT id FROM appointments WHERE id=$1 FOR UPDATE", [
          appointmentId,
        ])
      ).rows[0];
      if (!locked) throw new HttpError(404, "Agendamento não encontrado.");
      const current = await getAppointment(tx, appointmentId);
      appointmentAccess(user, current);
      if (current.status === "cancelled" || current.status === "completed")
        throw new HttpError(409, "Este agendamento já foi encerrado.");
      if (
        user.role === "client" &&
        new Date(current.startAt).getTime() - now().getTime() < 2 * 60 * 60_000
      )
        throw new HttpError(
          400,
          "Cancelamentos e remarcações precisam ser feitos com pelo menos 2 horas de antecedência.",
        );
      if (input.startAt) {
        if (user.role === "barber")
          throw new HttpError(
            403,
            "Somente o cliente ou a administração pode remarcar.",
          );
        const activeBarber = (
          await tx.query(
            "SELECT id FROM users WHERE id=$1 AND role='barber' AND active=true FOR SHARE",
            [current.barberId],
          )
        ).rows[0];
        if (!activeBarber)
          throw new HttpError(
            409,
            "Este profissional está indisponível. Entre em contato com a barbearia.",
          );
        if (new Date(current.startAt) <= now())
          throw new HttpError(
            400,
            "Só é possível remarcar agendamentos futuros.",
          );
        if (!validBusinessStart(input.startAt, current.durationMinutes, now()))
          throw new HttpError(
            400,
            "Escolha um horário futuro no horário de funcionamento.",
          );
        const dates = [
          ...new Set([
            localDate(new Date(current.startAt)),
            localDate(new Date(input.startAt)),
          ]),
        ].sort();
        for (const date of dates) await lockDay(tx, current.barberId, date);
        await assertFree(
          tx,
          current.barberId,
          input.startAt,
          current.durationMinutes,
          appointmentId,
        );
      }
      if (input.status) {
        if (user.role === "client" && input.status !== "cancelled")
          throw new HttpError(
            403,
            "Clientes só podem cancelar seus agendamentos.",
          );
        if (user.role === "client" && new Date(current.startAt) <= now())
          throw new HttpError(
            400,
            "Só é possível cancelar agendamentos futuros.",
          );
        if (input.status === "completed" && new Date(current.startAt) > now())
          throw new HttpError(400, "O atendimento ainda não começou.");
      }
      await tx.query(
        "UPDATE appointments SET start_at=$1,status=$2 WHERE id=$3",
        [
          input.startAt ?? current.startAt,
          input.status ?? current.status,
          appointmentId,
        ],
      );
      return getAppointment(tx, appointmentId);
    });
    res.json({ appointment });
  });
  app.get("/api/clients", roles("barber", "admin"), async (req, res) => {
    const search = z
      .string()
      .max(120)
      .parse(req.query.search ?? "");
    res.json({
      clients: (
        await db.query(
          `SELECT ${userColumns} FROM users WHERE role='client' AND active=true AND (name ILIKE $1 OR email ILIKE $1) ORDER BY name LIMIT 500`,
          [`%${search}%`],
        )
      ).rows,
    });
  });
  app.get("/api/blocks", roles("barber", "admin"), async (req, res) => {
    const input = z
      .object({ barberId: id.optional(), date: dateSchema.optional() })
      .parse(req.query);
    const user = res.locals.user;
    if (user.role === "barber" && input.barberId && input.barberId !== user.id)
      throw new HttpError(403, "Você só pode ver seus bloqueios.");
    const barberId = user.role === "barber" ? user.id : input.barberId;
    const blocks = await db.query(
      `${blocksSelect} WHERE ($1::uuid IS NULL OR barber_id=$1) AND ($2::timestamptz IS NULL OR (start_at >= $2 AND start_at < $2::timestamptz + interval '1 day')) ORDER BY start_at DESC LIMIT 500`,
      [barberId ?? null, input.date ? `${input.date}T00:00:00-03:00` : null],
    );
    res.json({ blocks: blocks.rows });
  });
  app.post("/api/blocks", roles("barber", "admin"), async (req, res) => {
    const input = z
      .object({
        barberId: id.optional(),
        startAt,
        endAt: startAt,
        reason: z.string().trim().max(200).default(""),
      })
      .strict()
      .parse(req.body);
    const user = res.locals.user;
    const barberId =
      input.barberId ?? (user.role === "barber" ? user.id : undefined);
    if (!barberId) throw new HttpError(400, "Selecione um profissional.");
    if (user.role === "barber" && barberId !== user.id)
      throw new HttpError(403, "Você só pode bloquear sua própria agenda.");
    const start = new Date(input.startAt),
      end = new Date(input.endAt);
    if (start >= end || start <= now() || localDate(start) !== localDate(end))
      throw new HttpError(
        400,
        "Informe um período futuro válido dentro do mesmo dia.",
      );
    const block = await db.transaction(async (tx) => {
      const barber = (
        await tx.query(
          "SELECT id FROM users WHERE id=$1 AND active=true AND role='barber'",
          [barberId],
        )
      ).rows[0];
      if (!barber) throw new HttpError(404, "Profissional indisponível.");
      await lockDay(tx, barberId, localDate(start));
      await assertFree(
        tx,
        barberId,
        input.startAt,
        (end.getTime() - start.getTime()) / 60_000,
      );
      const blockId = randomUUID();
      await tx.query(
        "INSERT INTO time_blocks (id,barber_id,start_at,end_at,reason) VALUES ($1,$2,$3,$4,$5)",
        [blockId, barberId, input.startAt, input.endAt, input.reason],
      );
      return (await tx.query(`${blocksSelect} WHERE id=$1`, [blockId])).rows[0];
    });
    res.status(201).json({ block });
  });
  app.delete("/api/blocks/:id", roles("barber", "admin"), async (req, res) => {
    const blockId = parseId(req.params.id);
    const user = res.locals.user;
    const result = await db.query(
      "DELETE FROM time_blocks WHERE id=$1 AND ($2='admin' OR barber_id=$3) RETURNING id",
      [blockId, user.role, user.id],
    );
    if (!result.rows.length)
      throw new HttpError(404, "Bloqueio não encontrado.");
    res.json({ message: "Horário liberado." });
  });

  app.use("/api/admin", roles("admin"));
  app.get("/api/admin/appointments", async (req, res) =>
    res.json({
      appointments: await listAppointments(req, res.locals.user, true),
    }),
  );
  app.get("/api/admin/overview", async (_req, res) => {
    const date = localDate(now());
    const result = (
      await db.query(
        `SELECT
      (SELECT count(*)::integer FROM users WHERE role='client' AND active=true) AS clients,
      (SELECT count(*)::integer FROM users WHERE role='barber' AND active=true) AS barbers,
      (SELECT count(*)::integer FROM appointments WHERE start_at >= $1 AND start_at < $1::timestamptz + interval '1 day' AND status<>'cancelled') AS "appointmentsToday",
      (SELECT COALESCE(sum(price_cents),0)::integer FROM appointments WHERE status='completed') AS "revenueCents",
      (SELECT count(*)::integer FROM appointments WHERE status='pending') AS "pendingAppointments"`,
        [`${date}T00:00:00-03:00`],
      )
    ).rows[0];
    const recent = await db.query(
      `${appointmentSelect} ORDER BY a.created_at DESC LIMIT 8`,
    );
    const revenue = await db.query(
      `SELECT to_char(start_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') AS month, sum(price_cents)::integer AS "revenueCents" FROM appointments WHERE status='completed' GROUP BY month ORDER BY month DESC LIMIT 6`,
    );
    const popular = await db.query(
      `SELECT s.name,count(*)::integer AS count FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.status<>'cancelled' GROUP BY s.id,s.name ORDER BY count DESC LIMIT 5`,
    );
    res.json({
      stats: result,
      recentAppointments: recent.rows,
      revenueByMonth: revenue.rows.reverse(),
      popularServices: popular.rows,
    });
  });
  const userInput = z
    .object({
      name,
      email,
      phone: phone.default(""),
      password,
      specialty: z.string().trim().max(200).default(""),
      bio: z.string().trim().max(1000).default(""),
      active: z.boolean().default(true),
    })
    .strict();
  for (const [resource, role] of [
    ["clients", "client"],
    ["barbers", "barber"],
  ] as const) {
    app.get(`/api/admin/${resource}`, async (req, res) => {
      const search = z
        .string()
        .max(120)
        .parse(req.query.search ?? "");
      const result = await db.query(
        `SELECT ${userColumns} FROM users WHERE role=$1 AND (name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2) ORDER BY active DESC,name LIMIT 1000`,
        [role, `%${search}%`],
      );
      res.json({ [resource]: result.rows });
    });
    app.post(`/api/admin/${resource}`, async (req, res) => {
      const input = userInput.parse(req.body);
      const hash = await hashPassword(input.password);
      const result = await db.query(
        `INSERT INTO users (id,name,email,phone,password_hash,role,specialty,bio,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${userColumns}`,
        [
          randomUUID(),
          input.name,
          input.email,
          input.phone,
          hash,
          role,
          input.specialty,
          input.bio,
          input.active,
        ],
      );
      res.status(201).json({ user: result.rows[0] });
    });
    app.patch(`/api/admin/${resource}/:id`, async (req, res) => {
      const userId = parseId(req.params.id);
      const input = userInput
        .partial()
        .refine(
          (value) => Object.keys(value).length > 0,
          "Informe uma alteração.",
        )
        .parse(req.body);
      const existing = (
        await db.query("SELECT * FROM users WHERE id=$1 AND role=$2", [
          userId,
          role,
        ])
      ).rows[0];
      if (!existing) throw new HttpError(404, "Pessoa não encontrada.");
      const hash = input.password
        ? await hashPassword(input.password)
        : existing.password_hash;
      const result = await db.transaction(async (tx) => {
        const updated = await tx.query(
          `UPDATE users SET name=$1,email=$2,phone=$3,password_hash=$4,specialty=$5,bio=$6,active=$7 WHERE id=$8 RETURNING ${userColumns}`,
          [
            input.name ?? existing.name,
            input.email ?? existing.email,
            input.phone ?? existing.phone,
            hash,
            input.specialty ?? existing.specialty,
            input.bio ?? existing.bio,
            input.active ?? existing.active,
            userId,
          ],
        );
        if (input.password || input.active === false)
          await tx.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
        return updated;
      });
      res.json({ user: result.rows[0] });
    });
    app.delete(`/api/admin/${resource}/:id`, async (req, res) => {
      const userId = parseId(req.params.id);
      await db.transaction(async (tx) => {
        const result = await tx.query(
          "UPDATE users SET active=false WHERE id=$1 AND role=$2 RETURNING id",
          [userId, role],
        );
        if (!result.rows.length)
          throw new HttpError(404, "Pessoa não encontrada.");
        await tx.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
      });
      res.json({ message: "Cadastro desativado. O histórico foi preservado." });
    });
  }
  const serviceInput = z
    .object({
      name,
      description: z.string().trim().max(1000).default(""),
      durationMinutes: z.number().int().min(15).max(240).multipleOf(5),
      priceCents: z.number().int().min(0).max(1_000_000),
      active: z.boolean().default(true),
    })
    .strict();
  app.get("/api/admin/services", async (req, res) => {
    const search = z
      .string()
      .max(120)
      .parse(req.query.search ?? "");
    res.json({
      services: (
        await db.query(
          `SELECT ${serviceColumns} FROM services WHERE name ILIKE $1 ORDER BY active DESC,sort_order,created_at,name`,
          [`%${search}%`],
        )
      ).rows,
    });
  });
  app.post("/api/admin/services", async (req, res) => {
    const input = serviceInput.parse(req.body);
    const result = await db.query(
      `INSERT INTO services (id,name,description,duration_minutes,price_cents,active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${serviceColumns}`,
      [
        randomUUID(),
        input.name,
        input.description,
        input.durationMinutes,
        input.priceCents,
        input.active,
      ],
    );
    res.status(201).json({ service: result.rows[0] });
  });
  app.patch("/api/admin/services/:id", async (req, res) => {
    const serviceId = parseId(req.params.id);
    const input = serviceInput
      .partial()
      .refine(
        (value) => Object.keys(value).length > 0,
        "Informe uma alteração.",
      )
      .parse(req.body);
    const existing = (
      await db.query("SELECT * FROM services WHERE id=$1", [serviceId])
    ).rows[0];
    if (!existing) throw new HttpError(404, "Serviço não encontrado.");
    const result = await db.query(
      `UPDATE services SET name=$1,description=$2,duration_minutes=$3,price_cents=$4,active=$5 WHERE id=$6 RETURNING ${serviceColumns}`,
      [
        input.name ?? existing.name,
        input.description ?? existing.description,
        input.durationMinutes ?? existing.duration_minutes,
        input.priceCents ?? existing.price_cents,
        input.active ?? existing.active,
        serviceId,
      ],
    );
    res.json({ service: result.rows[0] });
  });
  app.delete("/api/admin/services/:id", async (req, res) => {
    const result = await db.query(
      "UPDATE services SET active=false WHERE id=$1 RETURNING id",
      [parseId(req.params.id)],
    );
    if (!result.rows.length)
      throw new HttpError(404, "Serviço não encontrado.");
    res.json({ message: "Serviço desativado. O histórico foi preservado." });
  });
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "Recurso não encontrado.")),
  );
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      res
        .status(400)
        .json({
          message: error.issues[0]?.message ?? "Dados inválidos.",
          errors: error.flatten().fieldErrors,
        });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    if (error.code === "23505") {
      res
        .status(409)
        .json({ message: "Este e-mail ou telefone já está cadastrado." });
      return;
    }
    if (error.type === "entity.too.large") {
      res.status(413).json({ message: "Solicitação muito grande." });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ message: "JSON inválido." });
      return;
    }
    log(`Server error: ${error.message}`);
    res
      .status(500)
      .json({
        message: "Não foi possível concluir a solicitação. Tente novamente.",
      });
  });
  return app;
}
