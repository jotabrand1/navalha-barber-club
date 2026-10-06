import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, send } from "../../lib/api";
import { dateLabel, duration, money, time, today } from "../../lib/format";
import type { Appointment, Service, User } from "../../lib/types";
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
import {
  AppointmentCard,
  AppointmentDialog,
  ConfirmDialog,
  Metric,
  errorText,
  localDate,
  occupancy,
  validAppointments,
  weekDates,
} from "./shared";
import "./staff.css";

type Resource = "clients" | "barbers" | "services" | "appointments";
type Entity = User | Service;
interface AdminOverview {
  stats: {
    clients: number;
    barbers: number;
    appointmentsToday: number;
    revenueCents: number;
    pendingAppointments: number;
  };
  recentAppointments: Appointment[];
}
interface AdminData {
  clients: User[];
  barbers: User[];
  services: Service[];
  appointments: Appointment[];
  overview?: AdminOverview;
}
const resources: Record<
  string,
  {
    resource: Resource;
    title: string;
    description: string;
    singular: string;
    screen: string;
  }
> = {
  clientes: {
    resource: "clients",
    title: "Clientes",
    description: "Conheça o histórico e preferências de cada cliente.",
    singular: "cliente",
    screen: "37-2",
  },
  barbeiros: {
    resource: "barbers",
    title: "Barbeiros",
    description: "Gerencie equipe, especialidades e horários de trabalho.",
    singular: "barbeiro",
    screen: "38-2",
  },
  servicos: {
    resource: "services",
    title: "Serviços",
    description: "Configure duração, preço e disponibilidade do catálogo.",
    singular: "serviço",
    screen: "39-2",
  },
  agendamentos: {
    resource: "appointments",
    title: "Agendamentos",
    description: "Visualize e filtre todos os horários da barbearia.",
    singular: "agendamento",
    screen: "40-2",
  },
};
const emptyData: AdminData = {
  clients: [],
  barbers: [],
  services: [],
  appointments: [],
};

export function AdminPage() {
  const { pathname } = useLocation();
  const config = resources[pathname.split("/")[2]];
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState<Appointment | "new" | null>(null);
  const load = useCallback(async () => {
    setError("");
    try {
      const [clients, barbers, services, appointments, overview] =
        await Promise.all([
          api<{ clients: User[] }>("/admin/clients"),
          api<{ barbers: User[] }>("/admin/barbers"),
          api<{ services: Service[] }>("/admin/services"),
          api<{ appointments: Appointment[] }>("/admin/appointments"),
          api<AdminOverview>("/admin/overview"),
        ]);
      setData({
        clients: clients.clients,
        barbers: barbers.barbers,
        services: services.services,
        appointments: appointments.appointments,
        overview,
      });
    } catch (error) {
      setError(errorText(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="staff-page">
      <ErrorMessage message={error} />
      {error && (
        <Button variant="secondary" onClick={() => void load()}>
          Tentar novamente
        </Button>
      )}
      {loading ? (
        <div className="staff-loading" role="status">
          Carregando painel...
        </div>
      ) : config ? (
        <AdminList
          key={config.resource}
          config={config}
          data={data}
          reload={load}
          onBooking={setBooking}
        />
      ) : (
        <Overview data={data} onBooking={setBooking} />
      )}
      {booking && (
        <AppointmentDialog
          appointment={booking === "new" ? undefined : booking}
          onClose={() => setBooking(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}

function Overview({
  data,
  onBooking,
}: {
  data: AdminData;
  onBooking: (appointment: Appointment | "new") => void;
}) {
  const current = today();
  const days = weekDates(current);
  const activeToday = validAppointments(
    data.appointments.filter((row) => localDate(row.startAt) === current),
  );
  const revenue = activeToday.reduce((sum, row) => sum + row.priceCents, 0);
  const barbers = data.barbers.filter((barber) => barber.active !== false);
  const counts = days.map(
    (day) =>
      validAppointments(
        data.appointments.filter((row) => localDate(row.startAt) === day),
      ).length,
  );
  const max = Math.max(...counts, 1);
  const next = data.appointments
    .filter(
      (row) =>
        row.status !== "cancelled" &&
        row.status !== "completed" &&
        new Date(row.startAt).getTime() >= Date.now(),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 3);
  const average = barbers.length
    ? Math.round(
        barbers.reduce(
          (sum, barber) =>
            sum +
            occupancy(activeToday.filter((row) => row.barberId === barber.id)),
          0,
        ) / barbers.length,
      )
    : 0;
  return (
    <>
      <PageTitle
        eyebrow="Visão geral"
        title="A casa está em movimento"
        description="Acompanhe o desempenho da barbearia em tempo real."
        action={
          <Button onClick={() => onBooking("new")}>
            <Icon screen="15-2" name="imgIcon1" width={16} height={16} />
            Novo agendamento
          </Button>
        }
      />
      <div className="staff-metrics staff-metrics-four">
        <Metric
          label="Agendamentos hoje"
          value={activeToday.length}
          note={`${activeToday.filter((row) => row.status === "completed").length} atendimentos concluídos`}
          icon="imgIcon2"
        />
        <Metric
          label="Faturamento estimado"
          value={money(revenue)}
          note="Total previsto para hoje"
          icon="imgIcon3"
        />
        <Metric
          label="Ticket médio"
          value={money(
            activeToday.length ? Math.round(revenue / activeToday.length) : 0,
          )}
          note="Média dos agendamentos de hoje"
          icon="imgIcon4"
        />
        <Metric
          label="Ocupação média"
          value={`${average}%`}
          note="Expediente: 09:00 — 19:00"
          icon="imgIcon5"
        />
      </div>
      <div className="staff-overview-panels">
        <section className="staff-panel staff-week-panel">
          <div className="staff-section-head">
            <div>
              <h2>Movimento da semana</h2>
              <p>Agendamentos por dia</p>
            </div>
            <span className="staff-green">
              {counts.reduce((sum, count) => sum + count, 0)} horários
            </span>
          </div>
          <div
            className="staff-week-chart"
            role="img"
            aria-label={`Agendamentos da semana: ${counts.map((count, index) => `${["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"][index]} ${count}`).join(", ")}`}
          >
            {days.map((day, index) => (
              <div
                className={`staff-week-column ${day === current ? "is-today" : ""}`}
                key={day}
              >
                <span className="staff-week-value">{counts[index]}</span>
                <div className="staff-week-track">
                  <div
                    className="staff-week-bar"
                    style={{
                      height: `${counts[index] ? Math.max(5, (counts[index] / max) * 160) : 0}px`,
                    }}
                  />
                </div>
                <span className="staff-week-label">
                  {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][index]}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="staff-panel">
          <h2>Ocupação por barbeiro</h2>
          <div className="staff-occupancy-list">
            {barbers.length ? (
              barbers.map((barber, index) => {
                const percent = occupancy(
                  activeToday.filter((row) => row.barberId === barber.id),
                );
                return (
                  <div className="staff-occupancy" key={barber.id}>
                    <div className="staff-person">
                      <Avatar
                        name={barber.name}
                        color={index % 2 ? "#e17100" : "#fe9a00"}
                      />
                      <span>{barber.name}</span>
                      <strong>{percent}%</strong>
                    </div>
                    <div className="staff-progress">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState title="Nenhum profissional cadastrado" />
            )}
          </div>
        </section>
      </div>
      <section className="staff-upcoming">
        <div className="staff-section-head">
          <h2>Próximos agendamentos</h2>
          <Link className="staff-text-link" to="/admin/agendamentos">
            Ver agenda
            <Icon screen="15-2" name="imgIcon6" width={14} height={14} />
          </Link>
        </div>
        {next.length ? (
          <div className="staff-upcoming-grid">
            {next.map((row) => (
              <AppointmentCard
                key={row.id}
                appointment={row}
                onClick={() => onBooking(row)}
              />
            ))}
          </div>
        ) : (
          <div className="staff-panel">
            <EmptyState
              title="Nenhum agendamento futuro"
              description="Crie um horário para começar a movimentar a agenda."
            />
          </div>
        )}
      </section>
    </>
  );
}

function AdminList({
  config,
  data,
  reload,
  onBooking,
}: {
  config: (typeof resources)[string];
  data: AdminData;
  reload: () => Promise<void>;
  onBooking: (appointment: Appointment | "new") => void;
}) {
  const { resource, title, screen } = config;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [sortVisible, setSortVisible] = useState(false);
  const [edit, setEdit] = useState<Entity | "new" | null>(null);
  const [disable, setDisable] = useState<Entity | null>(null);
  const rows = data[resource];
  const appointments = resource === "appointments";
  const filtered = useMemo(
    () =>
      [...rows]
        .filter((row) => {
          const text =
            "clientName" in row
              ? `${row.clientName} ${row.barberName} ${row.serviceName} ${time(row.startAt)} ${dateLabel(row.startAt)}`
              : `${row.name} ${"email" in row ? `${row.email} ${row.phone} ${row.specialty || ""}` : `${row.description} ${row.category || ""}`}`;
          const status =
            "status" in row
              ? row.status
              : row.active === false
                ? "inactive"
                : "active";
          return (
            text
              .toLocaleLowerCase("pt-BR")
              .includes(search.toLocaleLowerCase("pt-BR")) &&
            (filter === "all" || status === filter)
          );
        })
        .sort((a, b) => {
          if ("startAt" in a && "startAt" in b)
            return sort === "desc"
              ? b.startAt.localeCompare(a.startAt)
              : a.startAt.localeCompare(b.startAt);
          if ("name" in a && "name" in b)
            return (
              (sort === "desc" ? -1 : 1) * a.name.localeCompare(b.name, "pt-BR")
            );
          return 0;
        }),
    [rows, search, filter, sort],
  );
  const size = 8;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(page, pages);
  const shown = filtered.slice((safePage - 1) * size, safePage * size);
  const active = rows.filter((row) =>
    "status" in row
      ? row.status === "confirmed" || row.status === "pending"
      : row.active !== false,
  ).length;
  const thisMonth = rows.filter((row) =>
    "startAt" in row
      ? localDate(row.startAt).slice(0, 7) === today().slice(0, 7)
      : row.createdAt
        ? localDate(row.createdAt).slice(0, 7) === today().slice(0, 7)
        : false,
  ).length;
  return (
    <>
      <PageTitle
        eyebrow="Gestão"
        title={title}
        description={config.description}
        action={
          <Button
            onClick={() => (appointments ? onBooking("new") : setEdit("new"))}
          >
            <Icon screen={screen} name="imgIcon1" width={16} height={16} />
            Novo {config.singular}
          </Button>
        }
      />
      <div className="staff-list-metrics">
        {[
          ["Total", rows.length],
          ["Ativos", active],
          [appointments ? "Este mês" : "Novos este mês", thisMonth],
        ].map(([label, value]) => (
          <div key={label} className="staff-list-metric">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="staff-table-panel">
        <div className="staff-table-toolbar">
          <label className="staff-search">
            <Icon screen={screen} name="imgIcon2" width={16} height={16} />
            <input
              aria-label={`Buscar em ${title.toLowerCase()}`}
              placeholder={`Buscar em ${title.toLowerCase()}...`}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <div className="staff-toolbar-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setFiltersVisible(!filtersVisible);
                setSortVisible(false);
              }}
              aria-expanded={filtersVisible}
            >
              <Icon screen={screen} name="imgIcon3" width={14} height={14} />
              Filtros{filter !== "all" && <span className="staff-filter-dot" />}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSortVisible(!sortVisible);
                setFiltersVisible(false);
              }}
              aria-expanded={sortVisible}
            >
              <Icon screen={screen} name="imgIcon4" width={14} height={14} />
              Ordenar
            </Button>
          </div>
        </div>
        {(filtersVisible || sortVisible) && (
          <div className="staff-table-options">
            {filtersVisible ? (
              <label>
                Status
                <select
                  aria-label="Status"
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">Todos</option>
                  {appointments ? (
                    <>
                      <option value="confirmed">Confirmados</option>
                      <option value="pending">Pendentes</option>
                      <option value="completed">Concluídos</option>
                      <option value="cancelled">Cancelados</option>
                    </>
                  ) : (
                    <>
                      <option value="active">Ativos</option>
                      <option value="inactive">Inativos</option>
                    </>
                  )}
                </select>
              </label>
            ) : (
              <label>
                Ordenação
                <select
                  aria-label="Ordenação"
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="name">
                    {appointments ? "Horário crescente" : "Nome de A a Z"}
                  </option>
                  <option value="desc">
                    {appointments ? "Horário decrescente" : "Nome de Z a A"}
                  </option>
                </select>
              </label>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setFilter("all");
                setSort("name");
                setSearch("");
                setPage(1);
              }}
            >
              Limpar filtros
            </Button>
          </div>
        )}
        <div className="staff-table-scroll">
          <table className="staff-table">
            <thead>
              <tr>
                {(resource === "clients"
                  ? ["Cliente", "Contato", "Histórico", "Próximo", "Status"]
                  : resource === "barbers"
                    ? [
                        "Profissional",
                        "Especialidade",
                        "Expediente",
                        "Ocupação",
                        "Status",
                      ]
                    : resource === "services"
                      ? ["Serviço", "Categoria", "Duração", "Preço", "Status"]
                      : ["Horário", "Cliente", "Barbeiro", "Serviço", "Status"]
                ).map((label) => (
                  <th key={label}>{label}</th>
                ))}
                <th>
                  <span className="staff-sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  {"startAt" in row ? (
                    <>
                      <td>
                        <span>{time(row.startAt)}</span>
                        <small>{dateLabel(row.startAt)}</small>
                      </td>
                      <td>{row.clientName}</td>
                      <td>{row.barberName}</td>
                      <td>{row.serviceName}</td>
                      <td>
                        <Badge status={row.status} />
                      </td>
                    </>
                  ) : "durationMinutes" in row ? (
                    <>
                      <td>
                        <div className="staff-person">
                          <Avatar name={row.name} />
                          <span>{row.name}</span>
                        </div>
                      </td>
                      <td>
                        {row.category ||
                          (/barba/i.test(row.name)
                            ? /corte/i.test(row.name)
                              ? "Combo"
                              : "Barba"
                            : "Cabelo")}
                      </td>
                      <td>{duration(row.durationMinutes)}</td>
                      <td>{money(row.priceCents)}</td>
                      <td>
                        <ActiveBadge active={row.active} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <div className="staff-person">
                          <Avatar name={row.name} />
                          <span>{row.name}</span>
                        </div>
                      </td>
                      {resource === "clients" ? (
                        <>
                          <td>
                            {row.phone || "Não informado"}
                            <small>{row.email}</small>
                          </td>
                          <td>
                            {
                              data.appointments.filter(
                                (item) =>
                                  item.clientId === row.id &&
                                  item.status === "completed",
                              ).length
                            }{" "}
                            visitas
                          </td>
                          <td>{nextDate(data.appointments, row.id)}</td>
                        </>
                      ) : (
                        <>
                          <td>{row.specialty || "Barbeiro"}</td>
                          <td>09:00 — 19:00</td>
                          <td>
                            {occupancy(
                              data.appointments.filter(
                                (item) =>
                                  item.barberId === row.id &&
                                  localDate(item.startAt) === today(),
                              ),
                            )}
                            %
                          </td>
                        </>
                      )}
                      <td>
                        <ActiveBadge active={row.active !== false} />
                      </td>
                    </>
                  )}
                  <td className="staff-table-action">
                    <button
                      className="staff-icon-button"
                      type="button"
                      aria-label={`Gerenciar ${"clientName" in row ? row.clientName : row.name}`}
                      onClick={() =>
                        "startAt" in row ? onBooking(row) : setEdit(row)
                      }
                    >
                      <Icon
                        screen={screen}
                        name="imgIcon5"
                        width={16}
                        height={16}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!shown.length && (
          <EmptyState
            title="Nenhum resultado encontrado"
            description="Ajuste a busca ou os filtros para ver os registros."
          />
        )}
        <div className="staff-table-footer">
          <span>
            Mostrando {shown.length} de {filtered.length} registros
          </span>
          <div className="staff-pagination">
            <button
              type="button"
              disabled={safePage <= 1}
              aria-label="Página anterior"
              onClick={() => setPage(safePage - 1)}
            >
              <Icon screen={screen} name="imgIcon6" width={16} height={16} />
            </button>
            <span>{safePage}</span>
            <button
              type="button"
              disabled={safePage >= pages}
              aria-label="Próxima página"
              onClick={() => setPage(safePage + 1)}
            >
              <Icon screen={screen} name="imgIcon7" width={16} height={16} />
            </button>
          </div>
        </div>
      </div>
      {edit && (
        <EntityDialog
          resource={resource as Exclude<Resource, "appointments">}
          entity={edit === "new" ? undefined : edit}
          title={`${edit === "new" ? "Novo" : "Editar"} ${config.singular}`}
          onClose={() => setEdit(null)}
          onSaved={() => void reload()}
          onDisable={(entity) => {
            setEdit(null);
            setDisable(entity);
          }}
        />
      )}
      {disable && (
        <ConfirmDialog
          title={`Desativar ${config.singular}?`}
          description={`${disable.name} ficará indisponível para novos agendamentos. O histórico será preservado.`}
          label="Desativar"
          onClose={() => setDisable(null)}
          onConfirm={async () => {
            await api(`/admin/${resource}/${disable.id}`, send("DELETE"));
            await reload();
          }}
        />
      )}
    </>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`staff-active-badge ${active ? "is-active" : "is-inactive"}`}
    >
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}
function nextDate(rows: Appointment[], clientId: string) {
  const next = rows
    .filter(
      (row) =>
        row.clientId === clientId &&
        row.status !== "cancelled" &&
        row.status !== "completed" &&
        new Date(row.startAt).getTime() >= Date.now(),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  return next ? dateLabel(next.startAt) : "—";
}

function EntityDialog({
  resource,
  entity,
  title,
  onClose,
  onSaved,
  onDisable,
}: {
  resource: Exclude<Resource, "appointments">;
  entity?: Entity;
  title: string;
  onClose: () => void;
  onSaved: () => void;
  onDisable: (entity: Entity) => void;
}) {
  const service = resource === "services";
  const existingService =
    entity && "durationMinutes" in entity ? entity : undefined;
  const existingUser = entity && "email" in entity ? entity : undefined;
  const [name, setName] = useState(entity?.name || "");
  const [email, setEmail] = useState(existingUser?.email || "");
  const [phone, setPhone] = useState(existingUser?.phone || "");
  const [password, setPassword] = useState("");
  const [specialty, setSpecialty] = useState(existingUser?.specialty || "");
  const [bio, setBio] = useState(existingUser?.bio || "");
  const [description, setDescription] = useState(
    existingService?.description || "",
  );
  const [minutes, setMinutes] = useState(
    existingService?.durationMinutes || 45,
  );
  const [price, setPrice] = useState(
    existingService ? String(existingService.priceCents / 100) : "55",
  );
  const [active, setActive] = useState(entity?.active !== false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = service
        ? {
            name: name.trim(),
            description: description.trim(),
            durationMinutes: minutes,
            priceCents: Math.round(Number(price) * 100),
            active,
          }
        : {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            ...(password ? { password } : {}),
            ...(resource === "barbers"
              ? { specialty: specialty.trim(), bio: bio.trim() }
              : {}),
            ...(entity ? { active } : {}),
          };
      await api(
        `/admin/${resource}${entity ? `/${entity.id}` : ""}`,
        send(entity ? "PATCH" : "POST", body),
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
    <Modal title={title} onClose={onClose}>
      <form className="staff-form" onSubmit={save}>
        <ErrorMessage message={error} />
        <label>
          Nome
          <input
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete={service ? "off" : "name"}
          />
        </label>
        {service ? (
          <>
            <label>
              Descrição
              <textarea
                required
                maxLength={1000}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="staff-form-grid">
              <label>
                Duração (minutos)
                <input
                  type="number"
                  required
                  min={15}
                  max={240}
                  step={5}
                  value={minutes}
                  onChange={(event) => setMinutes(Number(event.target.value))}
                />
              </label>
              <label>
                Preço (R$)
                <input
                  type="number"
                  required
                  min={1}
                  max={5000}
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </label>
            </div>
          </>
        ) : (
          <>
            <div className="staff-form-grid">
              <label>
                E-mail
                <input
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label>
                Telefone
                <input
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </label>
            </div>
            <label>
              {entity ? "Nova senha (opcional)" : "Senha inicial"}
              <input
                type="password"
                required={!entity}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo de 8 caracteres"
              />
            </label>
            {resource === "barbers" && (
              <>
                <label>
                  Especialidade
                  <input
                    required
                    maxLength={150}
                    value={specialty}
                    onChange={(event) => setSpecialty(event.target.value)}
                  />
                </label>
                <label>
                  Sobre o profissional
                  <textarea
                    maxLength={1000}
                    rows={3}
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                  />
                </label>
                <p className="staff-muted">
                  Expediente padrão: segunda a sábado, das 09:00 às 19:00.
                </p>
              </>
            )}
          </>
        )}
        {entity && entity.active === false && (
          <label className="staff-checkbox">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Ativo para novos agendamentos
          </label>
        )}
        <div className="staff-form-actions">
          {entity && active && (
            <Button
              type="button"
              variant="danger"
              onClick={() => onDisable(entity)}
            >
              Desativar
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
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
