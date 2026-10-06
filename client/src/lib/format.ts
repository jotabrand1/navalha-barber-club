export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
export const time = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
export const dateLabel = (
  iso: string,
  options: Intl.DateTimeFormatOptions = {},
) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    ...options,
  }).format(new Date(iso));
export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
export const duration = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ""}`
    : `${minutes} min`;
