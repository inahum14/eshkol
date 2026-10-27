import { useState } from "react";
import { MEDIA_ICON } from "../ui";

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
  const cats = ENVELOPE_CATEGORIES.filter((c) => envs.some((i) => (i.envelope_category || "other") === c.id));
  const [cat, setCat] = useState("all");
  const shown = envs
    .filter((i) => cat === "all" || (i.envelope_category || "other") === cat)
    .sort((a, b) => (a.opened_at ? 1 : 0) - (b.opened_at ? 1 : 0));
  const closed = envs.filter((i) => !i.opened_at).length;

  return (
    <div className="stack env-page">
      <div className="env-head">
        <h1>לפתוח כש…</h1>
        <p>{closed ? `${closed} מעטפות סגורות מחכות לך` : "פתחת את כל המעטפות 💜"}</p>
      </div>

      <button className="env-grapes" onClick={() => openSub("grapes")}>
        <span className="g-ic">🍇</span>
        <span><b>{d.grapes.length}</b> {d.grapes.length === 1 ? "ענב" : "ענבים"} · כל מעטפה נפתחת עם ענב אחד</span>
      </button>

      {cats.length > 1 && (
        <div className="env-cats">
          <button className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>הכול</button>
          {cats.map((c) => (
            <button key={c.id} className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}>{c.e} {c.label}</button>
          ))}
        </div>
      )}

      {!envs.length && <div className="empty">המעטפות בדרך 💌</div>}

      <div className="env-grid2">
        {shown.map((i) => {
          const c = catOf(i.envelope_category);
          return (
            <button key={i.id} className={`envelope ${i.opened_at ? "open" : ""}`} onClick={() => onOpen(i)}>
              <div className="env-art">
                <div className="flap" />
                <div className="seal">{i.opened_at ? MEDIA_ICON[i.media_type] : "♥"}</div>
              </div>
              <div className="env-title">{i.title}</div>
              <div className="env-sub">{i.opened_at ? "נפתחה · לראות שוב" : `${c.e} ${c.label}`}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
