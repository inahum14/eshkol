import { useEffect, useState } from "react";
import { supabase, rpc } from "../lib/supabase";
import { daysUntil } from "../lib/time";
import { useToast } from "../ui";
import { groupContacts } from "../shared/Emergency";

const REMINDER_KINDS = [
  { id: "streak", label: "תזכורת רצף (בערב, אם עוד לא פתחה היום)" },
  { id: "weekly_video", label: "תזכורת לסרטון השבועי (שישי בבוקר)" },
];

export default function SettingsAdmin() {
  const [s, setS] = useState(null);
  const [tpl, setTpl] = useState([]);
  const toast = useToast();

  const load = async () => {
    const [a, b] = await Promise.all([
      supabase.from("settings").select("*").eq("id", 1).single(),
      supabase.from("reminder_templates").select("*").order("created_at"),
    ]);
    setS(a.data); setTpl(b.data || []);
  };
  useEffect(() => { load(); }, []);
  if (!s) return null;

  const upd = async (patch, msg = "נשמר") => {
    await supabase.from("settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);
    toast(msg); load();
  };
  const enableClock = async () => {
    await upd({ return_clock_enabled: true }, "השעון הופעל ✈️");
    const { data: p } = await supabase.from("profiles").select("id").eq("role", "partner").single();
    if (p) await supabase.from("content_items").insert({
      kind: "live", media_type: "note", title: "שאלה קטנה ✈️", body: "מתי את חוזרת? 💜\nבעמוד \"שלי\" יש עכשיו שעון חזרה, אפשר לבחור שם תאריך.",
    });
  };

  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <div className="card stack">
        <h3>💬 משפט מצחיק בדף הבית</h3>
        <p className="muted small">מופיע אצלה מתחת לסרטון השבועי, כמו ציטוט במירכאות. השאר ריק כדי להסתיר.</p>
        <textarea style={{ minHeight: 70 }} defaultValue={s.home_quote || ""} placeholder="משהו מצחיק שקרה לנו…"
          onBlur={(e) => e.target.value.trim() !== (s.home_quote || "") && upd({ home_quote: e.target.value.trim() || null }, "המשפט עודכן ✓")} />
      </div>

      <div className="card stack">
        <h3>🔥 ענב על רצף</h3>
        <div className="row">
          <span className="small">ענב במתנה כל</span>
          <input type="number" min="0" style={{ width: 80 }} defaultValue={s.streak_bonus_every}
            onBlur={(e) => upd({ streak_bonus_every: Math.max(0, parseInt(e.target.value || "0", 10)) })} />
          <span className="small">ימים ברצף (0 = כבוי)</span>
        </div>
      </div>

      <div className="card stack">
        <h3>✈️ שעון חזרה</h3>
        {!s.return_clock_enabled ? (
          <>
            <p className="small">כבוי כרגע. כשתפעיל, היא תקבל הודעה ומסך לבחירת תאריך חזרה.</p>
            <button className="btn" onClick={enableClock}>להפעיל ולשאול אותה</button>
          </>
        ) : (
          <>
            <p className="small">{s.return_date ? `תאריך חזרה: ${s.return_date} (עוד ${daysUntil(s.return_date)} ימים)` : "מחכה שהיא תבחר תאריך"}</p>
            <div className="row">
              <input type="date" defaultValue={s.return_date || ""} onChange={(e) => e.target.value && rpc("set_return_date", { p_date: e.target.value }).then(load)} />
              <button className="btn small ghost" onClick={() => upd({ return_clock_enabled: false }, "כובה")}>לכבות</button>
            </div>
          </>
        )}
      </div>

      <div className="card stack">
        <h3>🌙 שעות שקטות אצלה</h3>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>מ-<input type="time" defaultValue={s.quiet_start.slice(0, 5)} onBlur={(e) => upd({ quiet_start: e.target.value })} /></label>
          <label className="field" style={{ flex: 1 }}>עד<input type="time" defaultValue={s.quiet_end.slice(0, 5)} onBlur={(e) => upd({ quiet_end: e.target.value })} /></label>
        </div>
        <p className="muted small">התראות בשעות האלה מחכות לבוקר, אלא אם היא הייתה פעילה באפליקציה ב-{s.active_override_minutes} הדקות האחרונות.</p>
      </div>

      <div className="card stack">
        <h3>🔔 נוסחי תזכורות</h3>
        {REMINDER_KINDS.map((k) => (
          <TemplateGroup key={k.id} kind={k} items={tpl.filter((t) => t.kind === k.id)} reload={load} />
        ))}
      </div>

      <EmergencyEditor />

      <div className="card stack">
        <h3>📱 התראות דחופות שיעירו אותך</h3>
        <p className="small">כדי ש"עידו, תקרא את זה" יעבור גם כשהטלפון במצב שינה: הגדרות ← ריכוז ← שינה ← אפליקציות ← להוסיף את <b>אני כאן</b>.</p>
      </div>

      <button className="btn ghost" onClick={() => supabase.auth.signOut()}>התנתקות</button>
    </div>
  );
}

function TemplateGroup({ kind, items, reload }) {
  const [text, setText] = useState("");
  const add = async () => {
    if (!text.trim()) return;
    await supabase.from("reminder_templates").insert({ kind: kind.id, text_body: text.trim() });
    setText(""); reload();
  };
  const del = async (t) => { await supabase.from("reminder_templates").delete().eq("id", t.id); reload(); };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <b className="small">{kind.label}</b>
      {items.map((t) => (
        <div key={t.id} className="row between small"><span>{t.text_body}</span><button className="linkbtn" onClick={() => del(t)}>מחיקה</button></div>
      ))}
      {!items.length && <span className="muted small">כרגע נשלחים נוסחי ברירת מחדל.</span>}
      <div className="row"><input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="נוסח חדש…" /><button className="btn small" onClick={add}>הוספה</button></div>
    </div>
  );
}

function EmergencyEditor() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ country: "", label: "", value: "", kind: "phone" });
  const toast = useToast();
  const load = async () => { const { data } = await supabase.from("emergency_contacts").select("*"); setRows(data || []); };
  useEffect(() => { load(); }, []);
  const add = async () => {
    const existing = rows.find((r) => r.country === form.country.trim());
    await supabase.from("emergency_contacts").insert({
      country: form.country.trim(), label: form.label.trim(), value: form.value.trim(), kind: form.kind,
      country_order: existing ? existing.country_order : 50, item_order: 100,
    });
    setForm({ ...form, label: "", value: "" }); toast("נוסף"); load();
  };
  const del = async (r) => { await supabase.from("emergency_contacts").delete().eq("id", r.id); load(); };
  const countries = [...new Set(rows.map((r) => r.country))];

  return (
    <div className="card stack">
      <h3>🆘 דף החירום שלה</h3>
      {groupContacts(rows).map(([c, items]) => (
        <details key={c}>
          <summary style={{ cursor: "pointer", fontWeight: 500 }}>{c} ({items.length})</summary>
          {items.map((r) => (
            <div key={r.id} className="row between small" style={{ padding: "4px 0" }}>
              <span>{r.label}: <b dir="ltr">{r.value}</b></span>
              <button className="linkbtn" onClick={() => del(r)}>מחיקה</button>
            </div>
          ))}
        </details>
      ))}
      <div className="hr" />
      <b className="small">הוספה (למשל מוקד הביטוח שלה, שגרירות, בית חב"ד)</b>
      <input type="text" list="countries" placeholder="מדינה / קבוצה" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
      <datalist id="countries">{countries.map((c) => <option key={c} value={c} />)}</datalist>
      <input type="text" placeholder="תיאור (למשל: מוקד חירום הביטוח)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      <div className="row">
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} style={{ width: 130 }}>
          <option value="phone">טלפון</option><option value="whatsapp">וואטסאפ</option><option value="email">מייל</option><option value="link">קישור</option><option value="note">הערה</option>
        </select>
        <input type="text" dir="ltr" placeholder="+972…" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
      </div>
      <button className="btn soft" disabled={!form.country.trim() || !form.label.trim() || !form.value.trim()} onClick={add}>הוספה</button>
    </div>
  );
}
