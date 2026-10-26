import { MEDIA_ICON } from "../ui";
import { timeLeft } from "../lib/time";

export const ENVELOPE_CATEGORIES = [
  { id: "miss", label: "כשאת מתגעגעת", e: "🫂" },
  { id: "hard", label: "כשקשה לך", e: "🌧️" },
  { id: "sleep", label: "כשאת לא נרדמת", e: "🌙" },
  { id: "amazing", label: "כשקרה משהו מדהים", e: "✨" },
  { id: "laugh", label: "כשבא לך לצחוק", e: "😂" },
  { id: "birthday", label: "ביום הולדת", e: "🎂" },
  { id: "other", label: "סתם ככה", e: "💜" },
];
export const catOf = (id) => ENVELOPE_CATEGORIES.find((c) => c.id === id) || ENVELOPE_CATEGORIES.at(-1);

export default function Envelopes({ d, onOpen, openSub }) {
  const envs = d.feed.filter((i) => i.kind === "envelope");
  const groups = ENVELOPE_CATEGORIES.map((c) => ({ ...c, items: envs.filter((i) => (i.envelope_category || "other") === c.id) }))
    .filter((g) => g.items.length);

  return (
    <div className="stack">
      <div className="topbar"><div className="title">לפתוח כש…</div></div>
      <div className="card soft row between">
        <div>
          <div className="grapes-row">
            {d.grapes.length ? d.grapes.map((g) => <span key={g.id} className="grape" />) : <span className="grape empty" />}
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            {d.grapes.length ? `${d.grapes.length} ענבים · ${timeLeft(d.grapes[0].expires_at)} לראשון` : "נגמרו הענבים להיום"}
          </div>
        </div>
        <button className="btn small soft" onClick={() => openSub("grape")}>לבקש ענב</button>
      </div>
      <p className="muted small">כל מעטפה נפתחת עם ענב אחד. ענב נשאר בתוקף 72 שעות.</p>

      {!groups.length && <div className="empty">המעטפות בדרך 💌</div>}
      {groups.map((g) => (
        <div key={g.id} className="stack">
          <h3>{g.e} {g.label}</h3>
          <div className="env-grid">
            {g.items.map((i) => (
              <div key={i.id} className={`env ${i.opened_at ? "opened" : ""}`} onClick={() => onOpen(i)}>
                <div className="e">{i.opened_at ? MEDIA_ICON[i.media_type] : "✉️"}</div>
                <div className="t">{i.title}</div>
                <div className="muted small">{i.opened_at ? "נפתחה" : "🍇 ענב אחד"}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
