import { useEffect, useState } from "react";
import { myTz } from "../lib/time";

export default function TwoClocks({ otherTz, otherName, selfTz }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 20000); return () => clearInterval(t); }, []);
  const mine = selfTz || myTz();
  const fmt = (tz) => new Intl.DateTimeFormat("he-IL", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const day = (tz) => new Intl.DateTimeFormat("he-IL", { timeZone: tz, weekday: "long" }).format(new Date());
  const offset = (tz) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date()).find((x) => x.type === "timeZoneName")?.value || "GMT";
    const m = p.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    return m ? (m[1] === "-" ? -1 : 1) * (+m[2] + (+(m[3] || 0)) / 60) : 0;
  };
  const diff = offset(otherTz) - offset(mine);
  const icon = (tz) => {
    const h = +new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date());
    return h >= 6 && h < 19 ? "☀️" : "🌙";
  };
  return (
    <div className="card clocks">
      <div className="clock">
        <div className="clock-label">{icon(mine)} השעה אצלך</div>
        <div className="clock-time">{fmt(mine)}</div>
        <div className="clock-day">{day(mine)}</div>
      </div>
      <div className="clock-sep">♥</div>
      <div className="clock">
        <div className="clock-label">{icon(otherTz)} השעה אצל {otherName}</div>
        <div className="clock-time">{fmt(otherTz)}</div>
        <div className="clock-day">{day(otherTz)}</div>
      </div>
      {diff !== 0 && <div className="clock-diff">אצל {otherName} {Math.abs(diff)} שעות {diff > 0 ? "קדימה" : "אחורה"}</div>}
    </div>
  );
}
