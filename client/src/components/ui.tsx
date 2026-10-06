import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { initials } from "../lib/format";
import type { Status } from "../lib/types";
import { useTheme } from "../lib/theme";
export function Icon({
  screen = "41-2",
  name = "imgIcon",
  className = "",
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { screen?: string; name?: string }) {
  return (
    <img
      {...props}
      className={`icon ${className}`}
      alt={props.alt ?? ""}
      src={`/assets/${screen}-${name}.svg`}
    />
  );
}
export function Brand({
  screen = "41-2",
  icon = "imgIcon",
}: {
  screen?: string;
  icon?: string;
}) {
  return (
    <Link to="/" className="brand" aria-label="Navalha Barber Club — início">
      <span className="brand-mark">
        <Icon screen={screen} name={icon} />
      </span>
      <span className="brand-name">
        <strong>NAVALHA</strong>
        <small>Barber Club</small>
      </span>
    </Link>
  );
}
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      {...props}
      type={type}
      className={`button button-${variant} ${className}`}
    />
  );
}
export function Avatar({ name, color }: { name: string; color?: string }) {
  return (
    <span
      className="avatar"
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
export function Badge({ status }: { status: Status | "active" | "inactive" }) {
  const labels = {
    confirmed: "Confirmado",
    pending: "Pendente",
    completed: "Concluído",
    cancelled: "Cancelado",
    active: "Ativo",
    inactive: "Inativo",
  };
  return (
    <span className={`badge badge-${status}`}>
      <i />
      {labels[status]}
    </span>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, []);
  return (
    <dialog
      className="modal"
      ref={dialog}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-header">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="modal-close"
          aria-label="Fechar janela"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
export function ErrorMessage({ message }: { message?: string | null }) {
  return message ? (
    <p className="error-message" role="alert">
      {message}
    </p>
  ) : null;
}
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
export function ThemeButton({
  screen = "41-2",
  name = "imgIcon8",
  className = "",
}: {
  screen?: string;
  name?: string;
  className?: string;
}) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      className={`theme-button ${className}`}
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
      title={theme === "dark" ? "Tema claro" : "Tema escuro"}
    >
      <Icon screen={screen} name={name} />
    </button>
  );
}
