export const myTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function fmtDateTime(iso, tz) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: tz, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}
export function fmtDate(iso, tz) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("he-IL", { timeZone: tz, day: "numeric", month: "long" }).format(new Date(iso));
}
export function fmtClock(tz, d = new Date()) {
  return new Intl.DateTimeFormat("he-IL", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "long" }).format(d);
}

function parts(tz, d) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t) => f.find((p) => p.type === t).value;
  return { y: +g("year"), m: +g("month"), d: +g("day"), h: +g("hour"), mi: +g("minute") };
}

/** "2026-11-30T10:00" wall time in tz -> Date */
export function wallToDate(local, tz) {
  const [date, time] = local.split("T");
  const guess = new Date(`${date}T${time}:00Z`);
  const p = parts(tz, guess);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}
/** Date -> "YYYY-MM-DDTHH:mm" wall time in tz (for datetime-local inputs) */
export function dateToWall(date, tz) {
  const p = parts(tz, date);
  const z = (n) => String(n).padStart(2, "0");
  return `${p.y}-${z(p.m)}-${z(p.d)}T${z(p.h)}:${z(p.mi)}`;
}

export function timeLeft(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return "פג";
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `עוד ${Math.floor(h / 24)} ימים ו-${h % 24} שע׳`;
  if (h >= 1) return `עוד ${h} שע׳`;
  return `עוד ${Math.max(1, Math.floor(ms / 60000))} דק׳`;
}

export function daysUntil(dateStr) {
  const t = new Date(dateStr + "T00:00:00");
  const n = new Date(); n.setHours(0, 0, 0, 0);
  return Math.round((t - n) / 86400000);
}
