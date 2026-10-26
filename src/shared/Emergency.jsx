import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const KEY = "eshkol-emergency";

export function hrefFor(c) {
  const digits = c.value.replace(/[^\d+]/g, "");
  if (c.kind === "phone") return `tel:${digits}`;
  if (c.kind === "whatsapp") return `https://wa.me/${digits.replace("+", "")}`;
  if (c.kind === "email") return `mailto:${c.value}`;
  if (c.kind === "link") return c.value;
  return null;
}
const ICON = { phone: "📞", whatsapp: "💬", email: "✉️", link: "🔗", note: "ℹ️" };

export function groupContacts(rows) {
  const by = new Map();
  [...rows].sort((a, b) => a.country_order - b.country_order || a.item_order - b.item_order).forEach((r) => {
    if (!by.has(r.country)) by.set(r.country, []);
    by.get(r.country).push(r);
  });
  return [...by.entries()];
}

export default function Emergency() {
  const [rows, setRows] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  });
  const [open, setOpen] = useState(null);

  useEffect(() => {
    supabase.from("emergency_contacts").select("*").then(({ data }) => {
      if (data?.length) {
        setRows(data);
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
      }
    });
  }, []);

  const groups = groupContacts(rows);
  return (
    <div className="stack">
      <h2>🆘 מספרי חירום</h2>
      <p className="muted small">הדף נשמר בטלפון ועובד גם בלי קליטה. לחיצה על מספר מחייגת.</p>
      {groups.map(([country, items], gi) => {
        const isOpen = open === country || (open === null && gi < 2);
        return (
          <div key={country} className="card stack" style={{ padding: 14 }}>
            <div className="row between" style={{ cursor: "pointer" }} onClick={() => setOpen(isOpen ? "" : country)}>
              <b>{country}</b><span className="muted">{isOpen ? "▴" : "▾"}</span>
            </div>
            {isOpen && items.map((c) => {
              const href = hrefFor(c);
              return (
                <a key={c.id} href={href || undefined} target={c.kind === "link" || c.kind === "whatsapp" ? "_blank" : undefined} rel="noreferrer"
                  className="row between" style={{ textDecoration: "none", color: "inherit", padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <span>{ICON[c.kind]} {c.label}</span>
                  {c.kind !== "link" && <b dir="ltr" style={{ color: "var(--grape)" }}>{c.value}</b>}
                </a>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
