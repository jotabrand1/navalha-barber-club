import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, send } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { dateLabel, duration, money, time, today } from "../../lib/format";
import type { Appointment } from "../../lib/types";
import {
  Avatar,
  Button,
  EmptyState,
  ErrorMessage,
  Icon,
  Modal,
  PageTitle,
} from "../../components/ui";
import {
  AppointmentDialog,
  AppointmentForm,
  AppointmentList,
  ConfirmDialog,
  Metric,
  bookedMinutes,
  errorText,
  localDate,
  occupancy,
  shiftDate,
  validAppointments,
  weekDates,
} from "./shared";
import "./staff.css";

interface Block {
  id: string;
  barberId: string;
  startAt: string;
  endAt: string;
  reason: string;
}

export function BarberPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (pathname.endsWith("/novo"))
    return (
      <div className="staff-page">
        <PageTitle
          eyebrow="Agenda profissional"
          title="Novo horário"
          description="Escolha o cliente, o serviço e um horário disponível na sua agenda."
        />
        <section className="staff-panel staff-new-appointment">
          <AppointmentForm
            onClose={() => navigate("/barbeiro")}
            onSaved={() => navigate("/barbeiro")}
          />
        </section>
      </div>
    );
  return <BarberAgenda />;
}

function BarberAgenda() {
  const { user } = useAuth();
  const [date, setDate] = useState(today());
  const [view, setView] = useState<"day" | "week">("day");
  const [rows, setRows] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [deleteBlock, setDeleteBlock] = useState<Block | null>(null);
  const [cancel, setCancel] = useState<Appointment | null>(null);
  const [busy, setBusy] = useState(false);
  const days = weekDates(date);
  const start = days[0];
  const end = days[6];
  const request = useRef(0);
  const load = useCallback(async () => {
    const current = ++request.current;
    setError("");
    setLoading(true);
    try {
      const [appointments, blocks] = await Promise.all([
        api<{ appointments: Appointment[] }>(
          `/appointments?from=${start}&to=${end}`,
        ),
        api<{ blocks: Block[] }>("/blocks"),
      ]);
      if (current !== request.current) return;
      setRows(
        appointments.appointments.sort((a, b) =>
          a.startAt.localeCompare(b.startAt),
        ),
      );
      setBlocks(blocks.blocks);
    } catch (error) {
      if (current === request.current) setError(errorText(error));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [start, end]);
  useEffect(() => {
    void load();
  }, [load]);
  const dayRows = rows.filter((row) => localDate(row.startAt) === date);
  const active = validAppointments(dayRows);
  const dayBlocks = blocks.filter((block) => localDate(block.startAt) === date);
  const booked = bookedMinutes(dayRows);
  const completed = active.filter((row) => row.status === "completed");
  const next = active.find(
    (row) =>
      row.status !== "completed" &&
      new Date(row.startAt).getTime() + row.durationMinutes * 60000 >
        Date.now(),
  );
  const dateTitle = dateLabel(`${date}T12:00:00-03:00`, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const isToday = date === today();
  const first = active.find((row) => row.status !== "completed");
  const morning = bookedInRange(active, date, "09:00", "12:00");
  const afternoon = bookedInRange(active, date, "12:00", "19:00");
  const blockMinutes = dayBlocks.reduce(
    (sum, block) =>
      sum +
      (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) /
        60000,
    0,
  );
  const free = Math.max(0, 600 - booked - blockMinutes);
  async function complete(appointment: Appointment) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/appointments/${appointment.id}`,
        send("PATCH", { status: "completed" }),
      );
      await load();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="staff-page">
      <PageTitle
        eyebrow={dateTitle}
        title={`${isToday ? greeting() : "Sua agenda"}, ${user?.name.split(" ")[0] || "barbeiro"}`}
        description={
          active.length
            ? `Você tem ${active.length} atendimento${active.length > 1 ? "s" : ""} ${isToday ? "hoje" : "neste dia"}.${first ? ` O primeiro começa às ${time(first.startAt)}.` : ""}`
            : `Sua agenda está livre ${isToday ? "hoje" : "neste dia"}.`
        }
        action={
          <div
            className="staff-view-toggle"
            aria-label="Visualização da agenda"
          >
            <button
              type="button"
              className={view === "day" ? "is-active" : ""}
              onClick={() => setView("day")}
              aria-pressed={view === "day"}
            >
              Dia
            </button>
            <button
              type="button"
              className={view === "week" ? "is-active" : ""}
              onClick={() => setView("week")}
              aria-pressed={view === "week"}
            >
              Semana
            </button>
          </div>
        }
      />
      <ErrorMessage message={error} />
      {error && (
        <Button variant="secondary" onClick={() => void load()}>
          Tentar novamente
        </Button>
      )}
      <div className="staff-metrics staff-metrics-three">
        <Metric
          screen="14-2"
          label="Atendimentos"
          value={active.length}
          note={`${completed.length} concluídos neste dia`}
          icon="imgIcon1"
        />
        <Metric
          screen="14-2"
          label={isToday ? "Faturamento hoje" : "Faturamento do dia"}
          value={money(completed.reduce((sum, row) => sum + row.priceCents, 0))}
          note="Somente atendimentos concluídos"
          icon="imgIcon2"
        />
        <Metric
          screen="14-2"
          label="Ocupação"
          value={`${occupancy(active)}%`}
          note={`${duration(booked)} agendados`}
          icon="imgIcon3"
        />
      </div>
      <div className="staff-agenda-layout">
        <section className="staff-agenda-main">
          <div className="staff-section-head">
            <div>
              <h2>
                {view === "day"
                  ? isToday
                    ? "Agenda de hoje"
                    : "Agenda do dia"
                  : "Agenda da semana"}
              </h2>
              <p>09:00 — 19:00 · segunda a sábado</p>
            </div>
            <Button onClick={() => setBlockOpen(true)}>
              <Icon screen="14-2" name="imgIcon4" width={16} height={16} />
              Bloquear horário
            </Button>
          </div>
          <div className="staff-date-control">
            <button
              type="button"
              aria-label={view === "day" ? "Dia anterior" : "Semana anterior"}
              onClick={() => setDate(shiftDate(date, view === "day" ? -1 : -7))}
            >
              <Icon screen="37-2" name="imgIcon6" width={16} height={16} />
            </button>
            <label>
              <span className="staff-sr-only">Data da agenda</span>
              <input
                type="date"
                value={date}
                onChange={(event) =>
                  event.target.value && setDate(event.target.value)
                }
              />
            </label>
            <button
              type="button"
              aria-label={view === "day" ? "Próximo dia" : "Próxima semana"}
              onClick={() => setDate(shiftDate(date, view === "day" ? 1 : 7))}
            >
              <Icon screen="37-2" name="imgIcon7" width={16} height={16} />
            </button>
            {!isToday && (
              <button
                type="button"
                className="staff-today"
                onClick={() => setDate(today())}
              >
                Hoje
              </button>
            )}
          </div>
          {loading ? (
            <p className="staff-loading" role="status">
              Carregando agenda...
            </p>
          ) : view === "day" ? (
            <>
              <AppointmentList rows={dayRows} onSelect={setSelected} />
              {dayBlocks.length > 0 && (
                <div className="staff-block-list">
                  <h3>Horários bloqueados</h3>
                  {dayBlocks.map((block) => (
                    <div className="staff-block" key={block.id}>
                      <div>
                        <strong>
                          {time(block.startAt)} — {time(block.endAt)}
                        </strong>
                        <span>{block.reason || "Indisponível"}</span>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => setDeleteBlock(block)}
                      >
                        Liberar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="staff-week-agenda">
              {days.map((day) => {
                const items = rows.filter(
                  (row) => localDate(row.startAt) === day,
                );
                const blocked = blocks.filter(
                  (block) => localDate(block.startAt) === day,
                );
                return (
                  <section className="staff-week-day" key={day}>
                    <button
                      className="staff-week-day-title"
                      type="button"
                      onClick={() => {
                        setDate(day);
                        setView("day");
                      }}
                    >
                      <strong>
                        {dateLabel(`${day}T12:00:00-03:00`, {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                        })}
                      </strong>
                      <span>{validAppointments(items).length} horários</span>
                    </button>
                    {items.length ? (
                      items.map((row) => (
                        <button
                          type="button"
                          className={`staff-week-event status-${row.status}`}
                          key={row.id}
                          onClick={() => setSelected(row)}
                        >
                          <strong>{time(row.startAt)}</strong>
                          <span>{row.clientName}</span>
                          <small>{row.serviceName}</small>
                        </button>
                      ))
                    ) : (
                      <p className="staff-muted">
                        {new Date(`${day}T12:00:00-03:00`).getUTCDay() === 0
                          ? "Fechado"
                          : "Agenda livre"}
                      </p>
                    )}
                    {blocked.map((block) => (
                      <button
                        className="staff-week-block"
                        key={block.id}
                        type="button"
                        onClick={() => setDeleteBlock(block)}
                      >
                        {time(block.startAt)} — {time(block.endAt)}
                        <small>{block.reason || "Bloqueado"}</small>
                      </button>
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </section>
        <aside className="staff-agenda-aside">
          <section className="staff-panel">
            <h2>Disponibilidade</h2>
            <div className="staff-availability">
              <AvailabilityBar label="Manhã" minutes={morning} capacity={180} />
              <AvailabilityBar
                label="Tarde"
                minutes={afternoon}
                capacity={420}
              />
              <AvailabilityBar
                label="Total do dia"
                minutes={booked}
                capacity={600}
              />
              <div>
                <span>Tempo livre</span>
                <strong>
                  {new Date(`${date}T12:00:00-03:00`).getUTCDay() === 0
                    ? "Fechado"
                    : duration(free)}
                </strong>
              </div>
              {blockMinutes > 0 && (
                <small>{duration(blockMinutes)} bloqueados</small>
              )}
            </div>
          </section>
          <section className="staff-panel staff-next-client">
            <h2>Próximo cliente</h2>
            {next ? (
              <>
                <div className="staff-person">
                  <Avatar name={next.clientName} />
                  <div>
                    <strong>{next.clientName}</strong>
                    <p>
                      {time(next.startAt)} · {next.serviceName}
                    </p>
                  </div>
                </div>
                <div className="staff-next-actions">
                  <Button
                    className="staff-complete-button"
                    disabled={
                      busy || new Date(next.startAt).getTime() > Date.now()
                    }
                    onClick={() => void complete(next)}
                  >
                    Concluir
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setCancel(next)}
                  >
                    Cancelar
                  </Button>
                </div>
                {new Date(next.startAt).getTime() > Date.now() && (
                  <small className="staff-muted">
                    A conclusão fica disponível quando o atendimento começa.
                  </small>
                )}
              </>
            ) : (
              <EmptyState
                title="Nenhum cliente previsto"
                description="Todos os atendimentos deste dia foram encerrados ou sua agenda está livre."
              />
            )}
          </section>
        </aside>
      </div>
      {selected && (
        <AppointmentDialog
          appointment={selected}
          onClose={() => setSelected(null)}
          onSaved={() => void load()}
        />
      )}
      {blockOpen && (
        <BlockDialog
          date={date}
          onClose={() => setBlockOpen(false)}
          onSaved={() => void load()}
        />
      )}
      {deleteBlock && (
        <ConfirmDialog
          title="Liberar horário?"
          description={`O período de ${time(deleteBlock.startAt)} a ${time(deleteBlock.endAt)} voltará a ficar disponível para agendamentos.`}
          label="Liberar horário"
          onClose={() => setDeleteBlock(null)}
          onConfirm={async () => {
            await api(`/blocks/${deleteBlock.id}`, send("DELETE"));
            await load();
          }}
        />
      )}
      {cancel && (
        <ConfirmDialog
          title="Cancelar agendamento?"
          description={`O atendimento de ${cancel.clientName} será cancelado e o horário será liberado.`}
          label="Cancelar agendamento"
          onClose={() => setCancel(null)}
          onConfirm={async () => {
            await api(
              `/appointments/${cancel.id}`,
              send("PATCH", { status: "cancelled" }),
            );
            await load();
          }}
        />
      )}
    </div>
  );
}

function AvailabilityBar({
  label,
  minutes,
  capacity,
}: {
  label: string;
  minutes: number;
  capacity: number;
}) {
  const percent = Math.min(100, Math.round((minutes / capacity) * 100));
  return (
    <div className="staff-availability-row">
      <div>
        <span>{label}</span>
        <strong>{duration(minutes)}</strong>
      </div>
      <div
        className="staff-availability-track"
        role="progressbar"
        aria-label={`${label}: tempo agendado`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}
function bookedInRange(
  rows: Appointment[],
  date: string,
  start: string,
  end: string,
) {
  const min = new Date(`${date}T${start}:00-03:00`).getTime();
  const max = new Date(`${date}T${end}:00-03:00`).getTime();
  return rows.reduce((total, row) => {
    const rowStart = new Date(row.startAt).getTime();
    return (
      total +
      Math.max(
        0,
        Math.min(max, rowStart + row.durationMinutes * 60000) -
          Math.max(min, rowStart),
      ) /
        60000
    );
  }, 0);
}

function BlockDialog({
  date: initialDate,
  onClose,
  onSaved,
}: {
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(
    initialDate < today() ? today() : initialDate,
  );
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("13:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (end <= start) {
      setError("O término precisa ser depois do início.");
      return;
    }
    setBusy(true);
    try {
      await api(
        "/blocks",
        send("POST", {
          startAt: `${date}T${start}:00-03:00`,
          endAt: `${date}T${end}:00-03:00`,
          reason: reason.trim(),
        }),
      );
      onSaved();
      onClose();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Bloquear horário" onClose={onClose}>
      <form className="staff-form" onSubmit={save}>
        <p className="staff-dialog-description">
          Reserve um período para uma pausa ou compromisso. Horários com
          clientes não podem ser bloqueados.
        </p>
        <ErrorMessage message={error} />
        <label>
          Data
          <input
            type="date"
            required
            min={today()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <div className="staff-form-grid">
          <label>
            Início
            <input
              type="time"
              required
              min="09:00"
              max="18:45"
              step={900}
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label>
            Término
            <input
              type="time"
              required
              min="09:15"
              max="19:00"
              step={900}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        </div>
        <label>
          Motivo <span className="staff-muted">(opcional)</span>
          <input
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex.: almoço, compromisso pessoal"
          />
        </label>
        <div className="staff-form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Voltar
          </Button>
          <Button disabled={busy} type="submit">
            {busy ? "Bloqueando..." : "Bloquear horário"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
