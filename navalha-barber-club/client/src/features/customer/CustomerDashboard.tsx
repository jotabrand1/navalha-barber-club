import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { api, send } from "../../lib/api";
import type { Appointment } from "../../lib/types";
import { dateLabel, duration, money, time } from "../../lib/format";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorMessage,
  Icon,
  Modal,
  PageTitle,
} from "../../components/ui";
import "./customer.css";

function AppointmentCard({
  appointment: item,
  onSelect,
}: {
  appointment: Appointment;
  onSelect: (appointment: Appointment) => void;
}) {
  return (
    <article className="customer-history-card">
      <div className="customer-history-date">
        <strong>
          {dateLabel(item.startAt)
            .replace(" de ", " ")
            .replace(".", "")
            .toUpperCase()}
        </strong>
        <small>{duration(item.durationMinutes)}</small>
      </div>
      <div className="customer-history-info">
        <div className="customer-history-title">
          <h3 title={item.serviceName}>{item.serviceName}</h3>
          <Badge status={item.status} />
        </div>
        <p>{item.barberName}</p>
        <div className="customer-history-bottom">
          <span>{money(item.priceCents)}</span>
          <button
            aria-label={`Ver detalhes de ${item.serviceName}, ${dateLabel(item.startAt)}, às ${time(item.startAt)}`}
            onClick={() => onSelect(item)}
          >
            <Icon screen="35-2" name="imgIcon5" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function CustomerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<{ appointments: Appointment[] }>("/appointments", {
      signal: controller.signal,
    })
      .then((data) => setAppointments(data.appointments))
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const upcoming = appointments
    .filter(
      (item) =>
        ["confirmed", "pending"].includes(item.status) &&
        new Date(item.startAt).getTime() > Date.now(),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const next = upcoming[0];
  const history = appointments
    .filter(
      (item) =>
        ["completed", "cancelled"].includes(item.status) ||
        new Date(item.startAt).getTime() <= Date.now(),
    )
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  const completed = appointments.filter(
    (item) => item.status === "completed",
  ).length;
  const editable =
    selected &&
    ["confirmed", "pending"].includes(selected.status) &&
    new Date(selected.startAt).getTime() - Date.now() >= 2 * 60 * 60 * 1000;
  const openDetails = (appointment: Appointment) => {
    setSelected(appointment);
    setCancelConfirm(false);
  };

  async function cancel() {
    if (!selected || !editable) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/appointments/${selected.id}`,
        send("PATCH", { status: "cancelled" }),
      );
      setAppointments((items) =>
        items.map((item) =>
          item.id === selected.id ? { ...item, status: "cancelled" } : item,
        ),
      );
      setSelected(null);
      setCancelConfirm(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível cancelar.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="customer-dashboard">
      <PageTitle
        eyebrow={`Olá, ${user?.name.split(" ")[0] || "cliente"}`}
        title="Hora de renovar o visual?"
        description={
          next
            ? next.status === "pending"
              ? "Seu próximo horário aguarda confirmação."
              : "Seu próximo horário está confirmado."
            : "Escolha um horário e deixe o resto com a gente."
        }
        action={
          <Button onClick={() => navigate("/agendar")}>
            <Icon screen="35-2" name="imgIcon2" />
            Novo agendamento
          </Button>
        }
      />
      <ErrorMessage message={error} />
      {loading ? (
        <div className="customer-loading" role="status">
          Buscando seus agendamentos…
        </div>
      ) : (
        <>
          <div className="customer-top-grid">
            <section
              className="customer-next-card"
              aria-label="Próximo agendamento"
            >
              {next ? (
                <>
                  <div className="customer-next-heading">
                    <p>Próximo agendamento</p>
                    <Badge status={next.status} />
                  </div>
                  <div className="customer-next-details">
                    <div>
                      <p className="customer-next-date">
                        {dateLabel(next.startAt, {
                          day: "2-digit",
                          month: undefined,
                        })}
                        <span>
                          {" "}
                          {dateLabel(next.startAt, {
                            day: undefined,
                            month: "short",
                          }).replace(".", "")}
                        </span>
                      </p>
                      <p className="customer-next-time">
                        {dateLabel(next.startAt, {
                          day: undefined,
                          month: undefined,
                          weekday: "long",
                        })}{" "}
                        · {time(next.startAt)}
                      </p>
                      <div className="customer-barber-row">
                        <span className="customer-barber-avatar">
                          <Avatar name={next.barberName} />
                        </span>
                        <div>
                          <strong>{next.barberName}</strong>
                          <p>
                            {next.serviceName} ·{" "}
                            {duration(next.durationMinutes)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="customer-next-total">
                      <p>Total</p>
                      <strong>{money(next.priceCents)}</strong>
                      <button
                        onClick={() => {
                          setSelected(next);
                          setCancelConfirm(false);
                        }}
                      >
                        Ver detalhes →
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="customer-next-heading">
                    <p>Próximo agendamento</p>
                  </div>
                  <EmptyState
                    title="Seu próximo visual começa aqui"
                    description="Ainda não há um horário agendado. Escolha seu serviço e profissional favorito."
                  />
                  <Link to="/agendar" className="customer-empty-link">
                    Agendar meu horário →
                  </Link>
                </>
              )}
            </section>
            <aside className="customer-club-card">
              <div className="customer-club-heading">
                <span>
                  <Icon screen="35-2" name="imgIcon3" />
                </span>
                <div>
                  <strong>Clube Navalha</strong>
                  <p>
                    {completed}{" "}
                    {completed === 1
                      ? "visita concluída"
                      : "visitas concluídas"}
                  </p>
                </div>
              </div>
              <div
                className="customer-club-progress"
                role="progressbar"
                aria-label="Visitas concluídas, referência de cinco visitas"
                aria-valuemin={0}
                aria-valuemax={5}
                aria-valuenow={Math.min(completed, 5)}
              >
                <span style={{ width: `${Math.min(completed, 5) * 20}%` }} />
              </div>
              <p className="customer-club-copy">
                {completed
                  ? "Cada visita conta. Seu histórico de cuidados, sempre à mão."
                  : "Comece sua história no clube com seu primeiro atendimento."}
              </p>
            </aside>
          </div>
          {upcoming.length > 1 ? (
            <section className="customer-history customer-other-bookings">
              <div className="customer-section-heading">
                <div>
                  <h2>Outros agendamentos</h2>
                  <p>Seus próximos horários</p>
                </div>
              </div>
              <div className="customer-history-grid">
                {upcoming.slice(1).map((item) => (
                  <AppointmentCard
                    key={item.id}
                    appointment={item}
                    onSelect={openDetails}
                  />
                ))}
              </div>
            </section>
          ) : null}
          <section className="customer-history">
            <div className="customer-section-heading">
              <div>
                <h2>Histórico</h2>
                <p>Seus últimos atendimentos</p>
              </div>
              {history.length > 3 ? (
                <Button
                  variant="ghost"
                  className="customer-view-all"
                  onClick={() => setShowAll((value) => !value)}
                >
                  {showAll ? "Ver menos" : "Ver todos"}
                  <Icon screen="35-2" name="imgIcon4" />
                </Button>
              ) : null}
            </div>
            {history.length ? (
              <div className="customer-history-grid">
                {(showAll ? history : history.slice(0, 3)).map((item) => (
                  <AppointmentCard
                    key={item.id}
                    appointment={item}
                    onSelect={openDetails}
                  />
                ))}
              </div>
            ) : (
              <div className="customer-history-empty">
                <EmptyState
                  title="Seu histórico começa no primeiro atendimento"
                  description="Os detalhes de suas visitas aparecerão aqui."
                />
              </div>
            )}
          </section>
        </>
      )}
      {selected ? (
        <Modal
          title={
            cancelConfirm ? "Cancelar agendamento?" : "Detalhes do agendamento"
          }
          onClose={() => {
            if (!busy) {
              setSelected(null);
              setCancelConfirm(false);
            }
          }}
        >
          <div className="customer-detail-modal">
            <Badge status={selected.status} />
            <h3>{selected.serviceName}</h3>
            <p>{selected.barberName}</p>
            <dl>
              <div>
                <dt>Data</dt>
                <dd>{dateLabel(selected.startAt, { year: "numeric" })}</dd>
              </div>
              <div>
                <dt>Horário</dt>
                <dd>{time(selected.startAt)}</dd>
              </div>
              <div>
                <dt>Duração</dt>
                <dd>{duration(selected.durationMinutes)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{money(selected.priceCents)}</dd>
              </div>
              {selected.notes ? (
                <div>
                  <dt>Observações</dt>
                  <dd>{selected.notes}</dd>
                </div>
              ) : null}
            </dl>
            <ErrorMessage message={error} />
            {cancelConfirm ? (
              <>
                <p>
                  Este horário será liberado para outros clientes. Você pode
                  agendar novamente quando quiser.
                </p>
                <div className="customer-modal-actions">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setCancelConfirm(false)}
                  >
                    Manter agendamento
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={cancel}>
                    {busy ? "Cancelando…" : "Confirmar cancelamento"}
                  </Button>
                </div>
              </>
            ) : editable ? (
              <div className="customer-modal-actions">
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate(
                      `/agendar?appointmentId=${selected.id}&serviceId=${selected.serviceId}&barberId=${selected.barberId}`,
                    )
                  }
                >
                  Reagendar
                </Button>
                <Button variant="danger" onClick={() => setCancelConfirm(true)}>
                  Cancelar horário
                </Button>
              </div>
            ) : (
              <p className="customer-detail-help">
                {["confirmed", "pending"].includes(selected.status)
                  ? "Alterações e cancelamentos ficam disponíveis até 2 horas antes do atendimento."
                  : "Este atendimento já foi finalizado. Para um novo horário, acesse Agendar."}
              </p>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
