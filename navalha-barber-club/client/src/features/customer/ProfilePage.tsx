import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, send } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Avatar, Button, ErrorMessage, PageTitle } from "../../components/ui";
import "./customer.css";

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty =
    name !== user?.name || email !== user?.email || phone !== user?.phone;

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api(
        "/auth/me",
        send("PATCH", {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
        }),
      );
      await refresh();
      setName(name.trim());
      setEmail(email.trim());
      setPhone(phone.trim());
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar seus dados.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-page">
      <PageTitle
        eyebrow="Sua conta"
        title="Meu perfil"
        description="Seus dados, sempre atualizados."
      />
      <section className="profile-card">
        <div className="profile-intro">
          <span className="profile-avatar">
            <Avatar name={user?.name || ""} />
          </span>
          <div>
            <h2>{user?.name}</h2>
            <p>
              {user?.role === "admin"
                ? "Administrador"
                : user?.role === "barber"
                  ? "Barbeiro"
                  : "Cliente Navalha"}
            </p>
          </div>
        </div>
        <form onSubmit={save} className="profile-form">
          <label>
            Nome completo
            <input
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <div className="profile-field-grid">
            <label>
              E-mail
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={180}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label>
              Telefone
              <input
                type="tel"
                autoComplete="tel"
                required
                maxLength={20}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
          </div>
          <ErrorMessage message={error} />
          {saved ? (
            <p className="profile-saved" role="status">
              Seus dados foram salvos.
            </p>
          ) : null}
          <div className="profile-actions">
            <p>Esses dados identificam sua conta e seus atendimentos.</p>
            <Button type="submit" disabled={busy || !dirty}>
              {busy ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </section>
      <section className="profile-security">
        <h2>Segurança da conta</h2>
        <p>
          Para redefinir sua senha, solicite um link de recuperação. O link é
          disponibilizado pelo ambiente de desenvolvimento nesta versão.
        </p>
        <Link to="/recuperar">Recuperar acesso →</Link>
      </section>
    </div>
  );
}
