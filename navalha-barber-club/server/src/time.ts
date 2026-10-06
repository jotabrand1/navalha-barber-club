export const TIMEZONE = "America/Sao_Paulo";
export function localDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function validBusinessStart(
  startAt: string,
  duration: number,
  now: Date,
): boolean {
  const start = new Date(startAt);
  if (!Number.isFinite(start.getTime()) || start <= now) return false;
  const date = localDate(start);
  if (new Date(`${date}T12:00:00-03:00`).getUTCDay() === 0) return false;
  const opening = new Date(`${date}T09:00:00-03:00`);
  const closing = new Date(`${date}T19:00:00-03:00`);
  return (
    start >= opening &&
    start.getTime() + duration * 60_000 <= closing.getTime() &&
    (start.getTime() - opening.getTime()) % (15 * 60_000) === 0
  );
}
export function businessSlots(
  date: string,
  duration: number,
  now: Date,
): string[] {
  const opening = new Date(`${date}T09:00:00-03:00`);
  if (!Number.isFinite(opening.getTime()) || localDate(opening) !== date)
    return [];
  const slots: string[] = [];
  for (let minute = 0; minute <= 600 - duration; minute += 15) {
    const slot = new Date(opening.getTime() + minute * 60_000).toISOString();
    if (validBusinessStart(slot, duration, now)) slots.push(slot);
  }
  return slots;
}
