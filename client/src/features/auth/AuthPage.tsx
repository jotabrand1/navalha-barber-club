import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
} from "react";
import type { FormEvent, ReactElement, ReactNode } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { api, send } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  Button,
  ErrorMessage,
  Icon,
  Modal,
  ThemeButton,
} from "../../components/ui";
import "./auth.css";

type Mode = "login" | "register" | "forgot" | "reset";

function fieldInput(children: ReactNode, id: string): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<{
      id?: string;
      children?: ReactNode;
    }>;
    if (element.type === "input") return cloneElement(element, { id });
    return element.props.children
      ? cloneElement(element, {
          children: fieldInput(element.props.children, id),
        })
      : element;
  });
}

function AuthField({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="auth-field">
      <div className="auth-label-row">
        <label htmlFor={id}>{label}</label>
        {action}
      </div>
      {fieldInput(children, id)}
    </div>
  );
}

export function AuthPage() {
  const { user, loading, login, register, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [query] = useSearchParams();
  const mode: Mode =
    location.pathname === "/cadastro"
      ? "register"
      : location.pathname === "/recuperar"
        ? "forgot"
        : location.pathname === "/redefinir"
          ? "reset"
          : "login";
  const screen = mode === "register" ? "34-2" : "41-2";
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [legal, setLegal] = useState(false);

  useEffect(() => {
    setError("");
    setNotice("");
    setResetUrl("");
    setPassword("");
    setConfirm("");
  }, [mode]);

  if (!loading && user && (mode === "login" || mode === "register"))
    return <Navigate to="/" replace />;
  const strength = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;
  const copy = {
    login: [
      "Bem-vindo de volta",
      "Entre na sua conta",
      "Acesse seus horários e mantenha o estilo em dia.",
    ],
    register: [
      "Faça parte do clube",
      "Crie sua conta",
      "Leva menos de um minuto.",
    ],
    forgot: [
      "Estamos aqui para ajudar",
      "Recupere seu acesso",
      "Informe o e-mail cadastrado para redefinir sua senha.",
    ],
    reset: [
      "Um novo começo",
      "Defina sua nova senha",
      "Escolha uma senha com pelo menos 8 caracteres.",
    ],
  }[mode];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(identifier.trim(), password, remember);
        navigate("/", { replace: true });
      }
      if (mode === "register") {
        if (password !== confirm)
          throw new Error("As senhas precisam ser iguais.");
        if (!accepted)
          throw new Error("Leia e aceite os termos para continuar.");
        await register({
          name: name.trim(),
          email: email.trim(),
          phone,
          password,
        });
        navigate("/", { replace: true });
      }
      if (mode === "forgot") {
        const response = await api<{
          message: string;
          delivery: string;
          resetUrl?: string;
        }>("/auth/forgot-password", send("POST", { email: email.trim() }));
        setNotice(response.message);
        setResetUrl(response.resetUrl || "");
      }
      if (mode === "reset") {
        if (password !== confirm)
          throw new Error("As senhas precisam ser iguais.");
        if (!query.get("token"))
          throw new Error(
            "Este link está incompleto. Solicite um novo link de recuperação.",
          );
        await api(
          "/auth/reset-password",
          send("POST", { token: query.get("token"), password }),
        );
        if (user) await logout();
        setNotice("Senha atualizada. Você já pode entrar na sua conta.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível continuar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  const passwordControl = (withIcon = false) => (
    <div className={`auth-input-wrap ${withIcon ? "has-icon" : ""}`}>
      {withIcon ? (
        <span className="auth-input-icon">
          <Icon screen="41-2" name="imgIcon4" />
        </span>
      ) : null}
      <input
        id="password"
        aria-label="Senha"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        type={showPassword ? "text" : "password"}
        minLength={mode === "login" ? undefined : 8}
        maxLength={128}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {withIcon ? (
        <button
          type="button"
          className="auth-password-toggle"
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((value) => !value)}
        >
          <Icon screen="41-2" name="imgIcon5" />
        </button>
      ) : null}
    </div>
  );

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Navalha Barber Club">
        <Link
          className="auth-brand"
          to="/login"
          aria-label="Navalha Barber Club, início"
        >
          <span className="auth-brand-mark">
            <Icon screen={screen} name="imgIcon" />
          </span>
          <span>
            <strong>NAVALHA</strong>
            <small>Barber Club</small>
          </span>
        </Link>
        <div className="auth-story-copy">
          <span className="auth-premium-mark">
            <Icon screen={screen} name="imgIcon1" />
          </span>
          <p className="auth-premium-label">Experiência premium</p>
          <h1>
            Seu estilo.
            <br />
            Seu momento.
          </h1>
          <p className="auth-story-description">
            Agende com os melhores profissionais, escolha seu horário e cuide do
            visual sem perder tempo.
          </p>
          <div className="auth-benefits">
            <span>
              <Icon screen={screen} name="imgIcon2" /> Agendamento rápido
            </span>
            <span>
              <Icon screen={screen} name="imgIcon2" /> Confirmação imediata
            </span>
          </div>
        </div>
        <p className="auth-copyright">
          © {new Date().getFullYear()} Navalha Barber Club
        </p>
      </section>
      <section className="auth-form-section">
        <ThemeButton
          className="auth-theme"
          screen={screen}
          name={mode === "register" ? "imgIcon5" : "imgIcon8"}
        />
        <div
          className={`auth-form-content ${mode === "register" ? "auth-register" : ""}`}
        >
          <p className="auth-eyebrow">{copy[0]}</p>
          <h2>{copy[1]}</h2>
          <p className="auth-intro">{copy[2]}</p>
          <form onSubmit={submit} className="auth-form">
            {mode === "register" ? (
              <>
                <div className="auth-field-grid">
                  <AuthField label="Nome completo">
                    <input
                      aria-label="Nome completo"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                      value={name}
                      placeholder="João Victor"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </AuthField>
                  <AuthField label="Telefone">
                    <input
                      aria-label="Telefone"
                      type="tel"
                      autoComplete="tel"
                      required
                      maxLength={20}
                      value={phone}
                      placeholder="(11) 98765-4321"
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </AuthField>
                </div>
                <AuthField label="E-mail">
                  <input
                    aria-label="E-mail"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={180}
                    value={email}
                    placeholder="joao@email.com"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </AuthField>
              </>
            ) : null}
            {mode === "login" ? (
              <AuthField label="E-mail ou telefone">
                <div className="auth-input-wrap has-icon">
                  <span className="auth-input-icon">
                    <Icon screen="41-2" name="imgIcon3" />
                  </span>
                  <input
                    aria-label="E-mail ou telefone"
                    autoComplete="username"
                    required
                    maxLength={180}
                    placeholder="joao@email.com"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                  />
                </div>
              </AuthField>
            ) : null}
            {mode === "forgot" ? (
              <AuthField label="E-mail">
                <input
                  aria-label="E-mail"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={180}
                  placeholder="joao@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </AuthField>
            ) : null}
            {mode !== "forgot" ? (
              <AuthField
                label="Senha"
                action={
                  mode === "login" ? (
                    <Link to="/recuperar">Esqueci minha senha</Link>
                  ) : undefined
                }
              >
                {passwordControl(mode === "login")}
                {mode === "register" ? (
                  <div className={`auth-strength strength-${strength}`}>
                    <div>
                      <span style={{ width: `${strength * 25}%` }} />
                    </div>
                    <small>
                      {password
                        ? strength >= 3
                          ? "Senha forte"
                          : strength === 2
                            ? "Senha média"
                            : "Senha fraca"
                        : "Mín. 8 caracteres"}
                    </small>
                  </div>
                ) : null}
              </AuthField>
            ) : null}
            {mode === "register" || mode === "reset" ? (
              <AuthField label="Confirmar senha">
                <input
                  aria-label="Confirmar senha"
                  autoComplete="new-password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </AuthField>
            ) : null}
            {mode === "login" ? (
              <label className="auth-checkbox auth-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="auth-checkbox-box">
                  {remember ? <Icon screen="41-2" name="imgIcon6" /> : null}
                </span>
                <span>Lembrar de mim</span>
              </label>
            ) : null}
            {mode === "register" ? (
              <div className="auth-terms">
                <label className="auth-checkbox">
                  <input
                    aria-label="Aceitar termos"
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  <span className="auth-checkbox-box">
                    {accepted ? <Icon screen="34-2" name="imgIcon3" /> : null}
                  </span>
                  <span>Li e aceito os </span>
                </label>
                <button type="button" onClick={() => setLegal(true)}>
                  Termos de Uso e a Política de Privacidade.
                </button>
              </div>
            ) : null}
            <ErrorMessage message={error} />
            {notice ? (
              <div className="auth-notice" role="status">
                <p>{notice}</p>
                {resetUrl ? (
                  <Link
                    to={
                      new URL(resetUrl, window.location.origin).pathname +
                      new URL(resetUrl, window.location.origin).search
                    }
                  >
                    Abrir link de recuperação de desenvolvimento
                  </Link>
                ) : null}
                {mode === "reset" ? (
                  <Link to="/login">Entrar na minha conta</Link>
                ) : null}
              </div>
            ) : null}
            <Button
              type="submit"
              disabled={
                busy || loading || (mode === "reset" && Boolean(notice))
              }
              className="auth-submit"
            >
              {busy
                ? "Aguarde…"
                : mode === "login"
                  ? "Entrar"
                  : mode === "register"
                    ? "Criar minha conta"
                    : mode === "forgot"
                      ? "Recuperar acesso"
                      : "Salvar nova senha"}
              {mode === "login" || mode === "register" ? (
                <Icon
                  screen={screen}
                  name={mode === "register" ? "imgIcon4" : "imgIcon7"}
                />
              ) : null}
            </Button>
          </form>
          <p className="auth-switch">
            {mode === "login" ? (
              <>
                Ainda não tem uma conta? <Link to="/cadastro">Cadastre-se</Link>
              </>
            ) : mode === "register" ? (
              <>
                Já tem uma conta? <Link to="/login">Entrar</Link>
              </>
            ) : (
              <Link to="/login">Voltar para entrar</Link>
            )}
          </p>
        </div>
      </section>
      {legal ? (
        <Modal title="Termos e privacidade" onClose={() => setLegal(false)}>
          <div className="auth-legal-copy">
            <p>
              Este projeto permite cadastrar sua conta e gerenciar agendamentos
              na Navalha Barber Club. Ao usá-lo, informe dados corretos e
              mantenha sua senha em sigilo.
            </p>
            <p>
              Nome, e-mail e telefone são armazenados para identificar sua conta
              e organizar seus atendimentos. Seus agendamentos ficam disponíveis
              para você e para a equipe responsável.
            </p>
            <p>
              Os dados permanecem no banco configurado para esta instalação. A
              recuperação de senha nesta versão utiliza um link de
              desenvolvimento e não envia e-mails. Não há pagamentos on-line
              neste projeto.
            </p>
            <p>
              Cancelamentos podem ser solicitados até 2 horas antes do
              atendimento. Para alterar seus dados, use a página Perfil.
            </p>
            <Button
              type="button"
              onClick={() => {
                setAccepted(true);
                setLegal(false);
              }}
            >
              Li e aceito
            </Button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
