import { useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { dateLabel } from "../lib/format";
import { Avatar, Brand, Icon, ThemeButton } from "./ui";
export function CustomerLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const screen = pathname === "/agendar" ? "36-2" : "35-2";
  return (
    <>
      <a className="skip-link" href="#main">
        Ir para o conteúdo
      </a>
      <header className="customer-header">
        <div className="customer-header-inner">
          <Brand screen={screen} />
          <nav className="customer-nav" aria-label="Menu principal">
            <NavLink to="/" end>
              Início
            </NavLink>
            <NavLink to="/agendar">Agendar</NavLink>
            <NavLink to="/perfil">Perfil</NavLink>
          </nav>
          <div className="header-user">
            <ThemeButton screen={screen} name="imgIcon1" />
            <details className="profile-menu">
              <summary aria-label="Opções da conta">
                <Avatar name={user!.name} />
              </summary>
              <div className="profile-dropdown">
                <Link to="/perfil">Meu perfil</Link>
                <button onClick={() => void logout()}>Sair da conta</button>
              </div>
            </details>
          </div>
        </div>
      </header>
      <main id="main" className="customer-main">
        <Outlet />
      </main>
    </>
  );
}
const adminNav = [
  ["/admin", "Visão geral"],
  ["/admin/clientes", "Clientes"],
  ["/admin/barbeiros", "Barbeiros"],
  ["/admin/servicos", "Serviços"],
  ["/admin/agendamentos", "Agendamentos"],
];
const barberNav = [
  ["/barbeiro", "Minha agenda"],
  ["/barbeiro/novo", "Novo horário"],
  ["/perfil", "Meu perfil"],
];
export function StaffLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const isAdmin = user!.role === "admin";
  const screen = isAdmin
    ? ({
        "/admin/clientes": "37-2",
        "/admin/barbeiros": "38-2",
        "/admin/servicos": "39-2",
        "/admin/agendamentos": "40-2",
      }[pathname] ?? "15-2")
    : "14-2";
  const nav = isAdmin ? adminNav : barberNav;
  const base = isAdmin ? 9 : 7;
  return (
    <div className="staff-layout">
      <a className="skip-link" href="#main">
        Ir para o conteúdo
      </a>
      <div
        className={`mobile-scrim ${open ? "is-open" : ""}`}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`staff-sidebar ${open ? "is-open" : ""}`}
        aria-label="Navegação lateral"
      >
        <Brand screen={screen} icon={isAdmin ? "imgIcon8" : "imgIcon6"} />
        <p className="sidebar-label">
          {isAdmin ? "Administração" : "Área do barbeiro"}
        </p>
        <nav className="staff-nav">
          {nav.map(([href, label], index) => (
            <NavLink
              to={href}
              end={index === 0}
              key={href}
              onClick={() => setOpen(false)}
            >
              <Icon screen={screen} name={`imgIcon${base + index}`} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <Avatar name={user!.name} />
          <div>
            <Link to="/perfil">
              <p>{user!.name}</p>
              <small>
                {isAdmin ? "Administradora" : user!.specialty || "Barbeiro"}
              </small>
            </Link>
            <br />
            <button className="logout" onClick={() => void logout()}>
              Sair da conta
            </button>
          </div>
        </div>
      </aside>
      <div className="staff-area">
        <header className="staff-topbar">
          <div className="staff-topbar-left">
            <button
              className="mobile-menu-button"
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <span>
                <i />
                <i />
                <i />
              </span>
            </button>
            <div>
              <p className="eyebrow">
                {isAdmin ? "Painel administrativo" : "Agenda profissional"}
              </p>
              <p className="muted">
                {dateLabel(new Date().toISOString(), {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </div>
          </div>
          <div className="header-user">
            <ThemeButton screen={screen} name="imgIcon" />
            <Link to="/perfil" className="header-user" aria-label="Meu perfil">
              <Avatar name={user!.name} />
              <span className="user-name">{user!.name}</span>
            </Link>
          </div>
        </header>
        <main id="main" className="staff-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
