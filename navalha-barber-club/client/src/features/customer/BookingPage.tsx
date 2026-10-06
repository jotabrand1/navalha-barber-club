import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, send } from "../../lib/api";
import type { Appointment, Catalog } from "../../lib/types";
import { dateLabel, duration, money, time, today } from "../../lib/format";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorMessage,
  Icon,
  PageTitle,
} from "../../components/ui";
import "./customer.css";

const stepLabels = ["Serviço", "Barbeiro", "Horário", "Confirmar"];
function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function weekStart(value: string) {
  return addDays(value, -new Date(`${value}T12:00:00Z`).getUTCDay());
}
const asIso = (value: string) => `${value}T12:00:00-03:00`;

export function BookingPage() {
  const navigate = useNavigate();
  const [query] = useSearchParams();
  const appointmentId = query.get("appointmentId");
  const [catalog, setCatalog] = useState<Catalog>({
    services: [],
    barbers: [],
  });
  const [serviceId, setServiceId] = useState(query.get("serviceId") || "");
  const [barberId, setBarberId] = useState(query.get("barberId") || "");
  const [step, setStep] = useState(appointmentId ? 2 : 0);
  const [reached, setReached] = useState(appointmentId ? 2 : 0);
  const [date, setDate] = useState(today);
  const [week, setWeek] = useState(() => weekStart(today()));
  const [slots, setSlots] = useState<string[]>([]);
  const [startAt, setStartAt] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Appointment | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<Catalog>("/catalog", { signal: controller.signal })
      .then(setCatalog)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!serviceId || !barberId) return;
    const controller = new AbortController();
    setSlotsLoading(true);
    setStartAt("");
    setSlots([]);
    setError("");
    api<{ slots: string[] }>(
      `/availability?date=${date}&barberId=${encodeURIComponent(barberId)}&serviceId=${encodeURIComponent(serviceId)}${appointmentId ? `&excludeAppointmentId=${encodeURIComponent(appointmentId)}` : ""}`,
      { signal: controller.signal },
    )
      .then((data) => setSlots(data.slots))
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [date, barberId, serviceId, appointmentId]);

  const service = catalog.services.find((item) => item.id === serviceId);
  const barber = catalog.barbers.find((item) => item.id === barberId);
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    addDays(week, index),
  );
  const ready =
    step === 0
      ? Boolean(service)
      : step === 1
        ? Boolean(barber)
        : step === 2
          ? Boolean(startAt) && !slotsLoading
          : Boolean(service && barber && startAt);
  function advance() {
    if (!ready) return;
    setStep((value) => value + 1);
    setReached((value) => Math.max(value, step + 1));
    setError("");
  }
  function changeWeek(days: number) {
    const nextWeek = addDays(week, days);
    const nextDate = addDays(
      nextWeek,
      new Date(`${date}T12:00:00Z`).getUTCDay(),
    );
    setWeek(nextWeek);
    setDate(nextDate < today() ? today() : nextDate);
    setReached(2);
  }

  async function confirmBooking() {
    if (!service || !barber || !startAt) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ appointment: Appointment }>(
        appointmentId
          ? `/appointments/${encodeURIComponent(appointmentId)}`
          : "/appointments",
        send(
          appointmentId ? "PATCH" : "POST",
          appointmentId
            ? { startAt }
            : {
                serviceId,
                barberId,
                startAt,
                notes: notes.trim() || undefined,
              },
        ),
      );
      setCreated(result.appointment);
      setStep(4);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível confirmar este horário.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (created)
    return (
      <div className="booking-page">
        <div className="booking-success">
          <span className="booking-success-mark">✓</span>
          <p className="customer-eyebrow">Tudo pronto</p>
          <h1>
            {appointmentId
              ? "Novo horário confirmado."
              : "Seu momento está marcado."}
          </h1>
          <p>Esperamos você na Navalha Barber Club.</p>
          <div className="booking-success-detail">
            <Badge status={created.status} />
            <h2>{created.serviceName}</h2>
            <p>{created.barberName}</p>
            <strong>
              {dateLabel(created.startAt, { weekday: "long", year: "numeric" })}{" "}
              · {time(created.startAt)}
            </strong>
            <p>
              {duration(created.durationMinutes)} · {money(created.priceCents)}
            </p>
          </div>
          <Button onClick={() => navigate("/")}>Ver meus agendamentos</Button>
        </div>
      </div>
    );

  return (
    <div className="booking-page">
      <button
        className="booking-back"
        onClick={() => {
          if (step > (appointmentId ? 2 : 0)) setStep((value) => value - 1);
          else navigate("/");
        }}
      >
        <Icon screen="36-2" name="imgIcon2" />
        Voltar
      </button>
      <PageTitle
        eyebrow={appointmentId ? "Reagendamento" : "Novo agendamento"}
        title="Escolha seu momento"
        description="Quatro passos rápidos para garantir seu próximo visual."
      />
      <nav className="booking-steps" aria-label="Etapas do agendamento">
        {stepLabels.map((label, index) => (
          <button
            key={label}
            className={`${index <= step ? "is-filled" : ""} ${index === step ? "is-current" : ""}`}
            aria-current={index === step ? "step" : undefined}
            disabled={
              index > reached || busy || Boolean(appointmentId && index < 2)
            }
            onClick={() => {
              setStep(index);
              setError("");
            }}
          >
            <span />
            <strong>
              {index + 1}. {label}
            </strong>
          </button>
        ))}
      </nav>
      <div className="booking-content-grid">
        <section
          className="booking-selection-panel"
          aria-label={stepLabels[step]}
        >
          <ErrorMessage message={error} />
          {loading ? (
            <div className="customer-loading" role="status">
              Carregando serviços e profissionais…
            </div>
          ) : (
            <>
              {step === 0 ? (
                <>
                  <div className="booking-panel-heading">
                    <div>
                      <h2>Qual é o seu estilo?</h2>
                      <p>Escolha o serviço ideal para você.</p>
                    </div>
                  </div>
                  {catalog.services.length ? (
                    <div className="booking-service-grid">
                      {catalog.services.map((item) => (
                        <button
                          key={item.id}
                          className={`booking-choice ${serviceId === item.id ? "is-selected" : ""}`}
                          aria-pressed={serviceId === item.id}
                          onClick={() => {
                            setServiceId(item.id);
                            setReached(0);
                          }}
                        >
                          <span className="booking-service-mark">
                            <Icon screen="36-2" name="imgIcon6" />
                          </span>
                          <span className="booking-choice-text">
                            <strong>{item.name}</strong>
                            <span>{item.description}</span>
                            <small>{duration(item.durationMinutes)}</small>
                          </span>
                          <span className="booking-choice-price">
                            {money(item.priceCents)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="Nenhum serviço disponível"
                      description="A equipe ainda está preparando os serviços. Tente novamente mais tarde."
                    />
                  )}
                </>
              ) : null}
              {step === 1 ? (
                <>
                  <div className="booking-panel-heading">
                    <div>
                      <h2>Escolha seu barbeiro</h2>
                      <p>Profissionais que cuidam de cada detalhe.</p>
                    </div>
                  </div>
                  {catalog.barbers.length ? (
                    <div className="booking-barber-grid">
                      {catalog.barbers.map((item) => (
                        <button
                          key={item.id}
                          className={`booking-choice booking-barber-choice ${barberId === item.id ? "is-selected" : ""}`}
                          aria-pressed={barberId === item.id}
                          onClick={() => {
                            setBarberId(item.id);
                            setReached(1);
                          }}
                        >
                          <span className="customer-barber-avatar">
                            <Avatar name={item.name} />
                          </span>
                          <span className="booking-choice-text">
                            <strong>{item.name}</strong>
                            <span>{item.specialty}</span>
                            {item.bio ? <small>{item.bio}</small> : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="Nenhum profissional disponível"
                      description="Tente novamente mais tarde."
                    />
                  )}
                </>
              ) : null}
              {step === 2 ? (
                <>
                  <div className="booking-panel-heading">
                    <div>
                      <h2>Data e horário</h2>
                      <p className="booking-month">
                        {dateLabel(asIso(date), {
                          day: undefined,
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="booking-calendar-controls">
                      <button
                        aria-label="Semana anterior"
                        disabled={addDays(week, -1) < today()}
                        onClick={() => changeWeek(-7)}
                      >
                        <Icon screen="36-2" name="imgIcon3" />
                      </button>
                      <button
                        aria-label="Próxima semana"
                        disabled={addDays(week, 7) > addDays(today(), 84)}
                        onClick={() => changeWeek(7)}
                      >
                        <Icon screen="36-2" name="imgIcon4" />
                      </button>
                    </div>
                  </div>
                  <div className="booking-week">
                    <div className="booking-week-labels">
                      {["D", "S", "T", "Q", "Q", "S", "S"].map(
                        (label, index) => (
                          <span key={index}>{label}</span>
                        ),
                      )}
                    </div>
                    <div className="booking-week-days">
                      {weekDates.map((day) => (
                        <button
                          key={day}
                          className={day === date ? "is-selected" : ""}
                          disabled={day < today() || day > addDays(today(), 90)}
                          aria-label={dateLabel(asIso(day), {
                            weekday: "long",
                            month: "long",
                          })}
                          aria-pressed={day === date}
                          onClick={() => {
                            setDate(day);
                            setReached(2);
                          }}
                        >
                          <span>{Number(day.slice(-2))}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <hr className="booking-divider" />
                  <p className="booking-slot-title">
                    Horários disponíveis ·{" "}
                    {dateLabel(asIso(date), {
                      weekday: "short",
                      month: undefined,
                    }).replace(".", "")}
                  </p>
                  {slotsLoading ? (
                    <div className="customer-loading" role="status">
                      Buscando horários disponíveis…
                    </div>
                  ) : slots.length ? (
                    <div
                      className="booking-slots"
                      role="group"
                      aria-label="Horários disponíveis"
                    >
                      {slots.map((slot) => (
                        <button
                          key={slot}
                          className={slot === startAt ? "is-selected" : ""}
                          aria-pressed={slot === startAt}
                          onClick={() => setStartAt(slot)}
                        >
                          {time(slot)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="booking-no-slots">
                      <EmptyState
                        title="Sem horários nesta data"
                        description="Selecione outro dia para encontrar seu momento."
                      />
                    </div>
                  )}
                </>
              ) : null}
              {step === 3 ? (
                <>
                  <div className="booking-panel-heading">
                    <div>
                      <h2>Confira seu agendamento</h2>
                      <p>Seu próximo visual está a um passo.</p>
                    </div>
                  </div>
                  <dl className="booking-confirm-details">
                    <div>
                      <dt>Serviço</dt>
                      <dd>{service?.name}</dd>
                    </div>
                    <div>
                      <dt>Profissional</dt>
                      <dd>{barber?.name}</dd>
                    </div>
                    <div>
                      <dt>Data e horário</dt>
                      <dd>
                        {dateLabel(startAt, {
                          weekday: "long",
                          year: "numeric",
                        })}{" "}
                        · {time(startAt)}
                      </dd>
                    </div>
                    <div>
                      <dt>Duração</dt>
                      <dd>
                        {service ? duration(service.durationMinutes) : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Total</dt>
                      <dd className="booking-confirm-price">
                        {service ? money(service.priceCents) : ""}
                      </dd>
                    </div>
                  </dl>
                  {!appointmentId ? (
                    <label className="booking-notes">
                      Observações <span>(opcional)</span>
                      <textarea
                        maxLength={500}
                        rows={3}
                        value={notes}
                        placeholder="Algo que seu barbeiro precisa saber?"
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </label>
                  ) : null}
                  <p className="booking-confirm-help">
                    O pagamento é realizado na barbearia após o atendimento.
                  </p>
                </>
              ) : null}
              <Button
                className="booking-continue"
                disabled={!ready || busy || loading}
                onClick={step === 3 ? confirmBooking : advance}
              >
                {busy
                  ? "Confirmando…"
                  : step === 3
                    ? appointmentId
                      ? "Confirmar novo horário"
                      : "Confirmar agendamento"
                    : "Continuar"}
                <Icon screen="36-2" name="imgIcon5" />
              </Button>
            </>
          )}
        </section>
        <aside className="booking-summary">
          <p className="customer-eyebrow">Seu agendamento</p>
          <div className="booking-summary-service">
            <span className="booking-service-mark">
              <Icon screen="36-2" name="imgIcon6" />
            </span>
            <div>
              <strong>{service?.name || "Escolha um serviço"}</strong>
              <p>
                {service
                  ? `${duration(service.durationMinutes)} · ${money(service.priceCents)}`
                  : "Do seu jeito, no seu tempo"}
              </p>
            </div>
          </div>
          <div className="booking-summary-barber">
            <span className="customer-barber-avatar">
              <Avatar name={barber?.name || "?"} />
            </span>
            <div>
              <strong>{barber?.name || "Seu profissional"}</strong>
              <p>
                {startAt
                  ? `${dateLabel(startAt)} · ${time(startAt)}`
                  : "Escolha o melhor horário"}
              </p>
            </div>
          </div>
          <p className="booking-cancellation-note">
            Cancelamentos gratuitos até 2 horas antes.
          </p>
        </aside>
      </div>
    </div>
  );
}
