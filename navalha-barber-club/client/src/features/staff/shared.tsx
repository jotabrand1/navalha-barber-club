import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api, send } from "../../lib/api";
import { dateLabel, duration, money, time, today } from "../../lib/format";
import { useAuth } from "../../lib/auth";
import type { Appointment, Catalog, Status, User } from "../../lib/types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorMessage,
  Icon,
  Modal,
} from "../../components/ui";
import "./staff.css";

export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";
export const localDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00-03:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return localDate(value.toISOString());
}
export function weekDates(date: string) {
  const day = new Date(`${date}T12:00:00-03:00`).getUTCDay();
  const monday = shiftDate(date, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}
export const validAppointments = (rows: Appointment[]) =>
  rows.filter((row) => row.status !== "cancelled");
export const bookedMinutes = (rows: Appointment[]) =>
  validAppointments(rows).reduce((sum, row) => sum + row.durationMinutes, 0);
export const occupancy = (rows: Appointment[], dayMinutes = 600) =>
  Math.min(100, Math.round((bookedMinutes(rows) / dayMinutes) * 100));

export function Metric({
  label,
  value,
  note,
  screen = "15-2",
  icon,
}: {
  label: string;
  value: ReactNode;
  note: string;
  screen?: string;
  icon: string;
}) {
  return (
    <div className="staff-metric">
      <div className="staff-metric-top">
        <div>
          <p>{label}</p>
          <strong>{value}</strong>
        </div>
        <span className="staff-metric-icon">
          <Icon screen={screen} name={icon} width={20} height={20} />
        </span>
      </div>
      <small>{note}</small>
    </div>
  );
}

export function AppointmentCard({
  appointment,
  compact = false,
  onClick,
  screen = "15-2",
}: {
  appointment: Appointment;
  compact?: boolean;
  onClick?: () => void;
  screen?: string;
}) {
  const content = (
    <>
      <div className="staff-appointment-time">
        <strong>{time(appointment.startAt)}</strong>
        <span>{duration(appointment.durationMinutes)}</span>
        {screen === "15-2" && <small>{dateLabel(appointment.startAt)}</small>}
      </div>
      <div className="staff-appointment-detail">
        <div className="staff-appointment-person">
          <strong>{appointment.clientName}</strong>
          <Badge status={appointment.status} />
        </div>
        <p className="staff-appointment-service">{appointment.serviceName}</p>
        <div className="staff-appointment-foot">
          <strong>{money(appointment.priceCents)}</strong>
          <Icon
            screen={screen}
            name={screen === "14-2" ? "imgIcon5" : "imgIcon7"}
            width={20}
            height={20}
          />
        </div>
      </div>
    </>
  );
  const className = `staff-appointment-card ${compact || screen === "15-2" ? "is-compact" : ""}`;
  return onClick ? (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={`Gerenciar atendimento de ${appointment.clientName} às ${time(appointment.startAt)}`}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function ConfirmDialog({
  title,
  description,
  label,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  label: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <p className="staff-dialog-description">{description}</p>
      <ErrorMessage message={error} />
      <div className="staff-form-actions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Voltar
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onConfirm();
              onClose();
            } catch (error) {
              setError(errorText(error));
              setBusy(false);
            }
          }}
        >
          {busy ? "Aguarde..." : label}
        </Button>
      </div>
    </Modal>
  );
}

export function AppointmentForm({
  appointment,
  onSaved,
  onClose,
}: {
  appointment?: Appointment;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<Catalog>({
    services: [],
    barbers: [],
  });
  const [clients, setClients] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(appointment?.clientId || "");
  const [barberId, setBarberId] = useState(
    appointment?.barberId || (user?.role === "barber" ? user.id : ""),
  );
  const [serviceId, setServiceId] = useState(appointment?.serviceId || "");
  const [date, setDate] = useState(
    appointment ? localDate(appointment.startAt) : today(),
  );
  const [slot, setSlot] = useState(appointment?.startAt || "");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [status, setStatus] = useState<Status>(
    appointment?.status || "confirmed",
  );
  const [notes, setNotes] = useState(appointment?.notes || "");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const terminal =
    appointment?.status === "completed" || appointment?.status === "cancelled";
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Catalog>("/catalog"),
      api<{ clients: User[] }>("/clients"),
    ])
      .then(([catalog, data]) => {
        if (!active) return;
        setCatalog(catalog);
        setClients(
          data.clients.filter(
            (client) =>
              client.active !== false || client.id === appointment?.clientId,
          ),
        );
      })
      .catch((error) => active && setError(errorText(error)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [appointment?.clientId]);
  useEffect(() => {
    if (appointment && (user?.role === "barber" || terminal)) {
      setSlots([appointment.startAt]);
      setSlot(appointment.startAt);
      setSlotsLoading(false);
      return;
    }
    if (!barberId || !serviceId || !date) {
      setSlots([]);
      return;
    }
    let active = true;
    setSlotsLoading(true);
    setError("");
    const query = new URLSearchParams({
      barberId,
      serviceId,
      date,
      ...(appointment ? { excludeAppointmentId: appointment.id } : {}),
    });
    api<{ slots: string[] }>(`/availability?${query}`)
      .then((data) => {
        if (!active) return;
        let values = data.slots;
        if (
          appointment &&
          date === localDate(appointment.startAt) &&
          !values.includes(appointment.startAt)
        )
          values = [appointment.startAt, ...values];
        setSlots(values.sort());
        setSlot((previous) => (values.includes(previous) ? previous : ""));
      })
      .catch((error) => active && setError(errorText(error)))
      .finally(() => active && setSlotsLoading(false));
    return () => {
      active = false;
    };
  }, [barberId, serviceId, date, appointment, user?.role, terminal]);
  const service =
    appointment || catalog.services.find((service) => service.id === serviceId);
  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!slot) {
      setError("Escolha um horário disponível.");
      return;
    }
    setBusy(true);
    try {
      await api(
        appointment ? `/appointments/${appointment.id}` : "/appointments",
        send(
          appointment ? "PATCH" : "POST",
          appointment
            ? {
                ...(slot !== appointment.startAt && user?.role === "admin"
                  ? { startAt: slot }
                  : {}),
                status,
              }
            : { clientId, barberId, serviceId, startAt: slot, notes },
        ),
      );
      onSaved();
      onClose();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <p className="staff-loading" role="status">
        Carregando opções de agendamento...
      </p>
    );
  return (
    <>
      <form className="staff-form" onSubmit={save}>
        <ErrorMessage message={error} />
        <div className="staff-form-grid">
          <label>
            Cliente
            <select
              aria-label="Cliente"
              required
              value={clientId}
              disabled={!!appointment}
              onChange={(event) => setClientId(event.target.value)}
            >
              <option value="">Selecione o cliente</option>
              {appointment &&
                !clients.some(
                  (client) => client.id === appointment.clientId,
                ) && (
                  <option value={appointment.clientId}>
                    {appointment.clientName}
                  </option>
                )}
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Profissional
            <select
              aria-label="Profissional"
              required
              value={barberId}
              disabled={!!appointment || user?.role === "barber"}
              onChange={(event) => setBarberId(event.target.value)}
            >
              <option value="">Selecione o profissional</option>
              {appointment &&
                !catalog.barbers.some(
                  (barber) => barber.id === appointment.barberId,
                ) && (
                  <option value={appointment.barberId}>
                    {appointment.barberName}
                  </option>
                )}
              {catalog.barbers.map((barber) => (
                <option key={barber.id} value={barber.id}>
                  {barber.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Serviço
          <select
            aria-label="Serviço"
            required
            value={serviceId}
            disabled={!!appointment}
            onChange={(event) => setServiceId(event.target.value)}
          >
            <option value="">Selecione o serviço</option>
            {appointment &&
              !catalog.services.some(
                (service) => service.id === appointment.serviceId,
              ) && (
                <option value={appointment.serviceId}>
                  {appointment.serviceName} ·{" "}
                  {duration(appointment.durationMinutes)} ·{" "}
                  {money(appointment.priceCents)}
                </option>
              )}
            {catalog.services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} · {duration(service.durationMinutes)} ·{" "}
                {money(service.priceCents)}
              </option>
            ))}
          </select>
        </label>
        <div className="staff-form-grid">
          <label>
            Data
            <input
              type="date"
              min={appointment ? undefined : today()}
              required
              value={date}
              disabled={terminal || (!!appointment && user?.role === "barber")}
              onChange={(event) => {
                setDate(event.target.value);
                setSlot("");
              }}
            />
          </label>
          {appointment && (
            <label>
              Status
              <select
                aria-label="Status"
                disabled={terminal}
                value={status}
                onChange={(event) => setStatus(event.target.value as Status)}
              >
                <option value="confirmed">Confirmado</option>
                <option value="pending">Pendente</option>
                <option value="completed">Concluído</option>
                {appointment.status === "cancelled" && (
                  <option value="cancelled">Cancelado</option>
                )}
              </select>
            </label>
          )}
        </div>
        <fieldset className="staff-slot-fieldset">
          <legend>
            {appointment && user?.role === "barber"
              ? "Horário do atendimento"
              : "Horário disponível"}
          </legend>
          {appointment && (user?.role === "barber" || terminal) ? (
            <p>
              {time(appointment.startAt)} ·{" "}
              {duration(appointment.durationMinutes)}
            </p>
          ) : slotsLoading ? (
            <p className="staff-muted" role="status">
              Consultando disponibilidade...
            </p>
          ) : slots.length ? (
            <div className="staff-slots">
              {slots.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={slot === value ? "is-selected" : ""}
                  onClick={() => setSlot(value)}
                  aria-pressed={slot === value}
                >
                  {time(value)}
                </button>
              ))}
            </div>
          ) : (
            <p className="staff-muted">
              {barberId && serviceId
                ? "Nenhum horário disponível nessa data. Escolha outro dia."
                : "Escolha o profissional e o serviço para consultar a agenda."}
            </p>
          )}
        </fieldset>
        {!appointment && (
          <label>
            Observações <span className="staff-muted">(opcional)</span>
            <textarea
              value={notes}
              maxLength={1000}
              rows={3}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Preferências do cliente ou informações para o atendimento"
            />
          </label>
        )}
        {service && (
          <div className="staff-booking-summary">
            <span>{duration(service.durationMinutes)} de atendimento</span>
            <strong>{money(service.priceCents)}</strong>
          </div>
        )}
        {terminal && (
          <p className="staff-muted">
            Este agendamento está encerrado. O histórico permanece disponível
            para consulta.
          </p>
        )}
        <div className="staff-form-actions">
          {appointment && !terminal && (
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmCancel(true)}
              disabled={busy}
            >
              Cancelar horário
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Voltar
          </Button>
          {!terminal && (
            <Button type="submit" disabled={busy || slotsLoading || !slot}>
              {busy
                ? "Salvando..."
                : appointment
                  ? "Salvar alterações"
                  : "Confirmar agendamento"}
            </Button>
          )}
        </div>
      </form>
      {confirmCancel && (
        <ConfirmDialog
          title="Cancelar agendamento?"
          description={`O horário de ${appointment?.clientName} será liberado na agenda.`}
          label="Cancelar agendamento"
          onClose={() => setConfirmCancel(false)}
          onConfirm={async () => {
            await api(
              `/appointments/${appointment!.id}`,
              send("PATCH", { status: "cancelled" }),
            );
            onSaved();
            onClose();
          }}
        />
      )}
    </>
  );
}

export function AppointmentDialog({
  appointment,
  onClose,
  onSaved,
}: {
  appointment?: Appointment;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Modal
      title={appointment ? "Gerenciar agendamento" : "Novo agendamento"}
      onClose={onClose}
    >
      <AppointmentForm
        appointment={appointment}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Modal>
  );
}

export function AppointmentList({
  rows,
  onSelect,
  screen = "14-2",
}: {
  rows: Appointment[];
  onSelect: (appointment: Appointment) => void;
  screen?: string;
}) {
  return rows.length ? (
    <div className="staff-appointment-list">
      {rows.map((row) => (
        <AppointmentCard
          key={row.id}
          appointment={row}
          onClick={() => onSelect(row)}
          screen={screen}
        />
      ))}
    </div>
  ) : (
    <EmptyState
      title="Agenda livre"
      description="Ainda não há atendimentos para este período."
    />
  );
}
