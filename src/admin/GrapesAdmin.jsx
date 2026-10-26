import { useEffect, useState } from "react";
import { supabase, rpc } from "../lib/supabase";
import { wallToDate, dateToWall, fmtDateTime } from "../lib/time";
import { useToast } from "../ui";

const SOURCE = { daily: "יומי", bonus: "בונוס", quiz: "חידה", request: "בקשה" };

export default function GrapesAdmin({ partner, greqs, reload }) {
  const tz = partner?.timezone || "America/Argentina/Buenos_Aires";
  const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [settings, setSettings] = useState(null);
  const [grapes, setGrapes] = useState([]);
  const [bonus, setBonus] = useState([]);
  const [when, setWhen] = useState(() => dateToWall(new Date(Date.now() + 86400000), tz).slice(0, 11) + "09:00");
  const [note, setNote] = useState("");
  const toast = useToast();

  const load = async () => {
    const [s, g, b] = await Promise.all([
      supabase.from("settings").select("*").eq("id", 1).single(),
      supabase.from("grapes").select("*").order("granted_at", { ascending: false }).limit(40),
      supabase.from("scheduled_bonus_grapes").select("*").order("grant_at"),
    ]);
    setSettings(s.data); setGrapes(g.data || []); setBonus(b.data || []);
  };
  useEffect(() => { load(); }, []);
  if (!settings) return null;

  const saveDaily = async (n) => {
    await supabase.from("settings").update({ daily_grapes: n, updated_at: new Date().toISOString() }).eq("id", 1);
    toast("נשמר"); load();
  };
  const giveNow = async () => {
    await supabase.from("grapes").insert({ source: "bonus", note: note.trim() || "מתנה ממני", expires_at: new Date(Date.now() + settings.grape_ttl_hours * 3600000).toISOString() });
    const { data: p } = await supabase.from("profiles").select("id").eq("role", "partner").single();
    toast("ענב נשלח 🍇"); setNote(""); load();
    return p;
  };
  const schedule = async () => {
    await supabase.from("scheduled_bonus_grapes").insert({ grant_at: wallToDate(when, tz).toISOString(), note: note.trim() || null });
    toast("תוזמן"); setNote(""); load();
  };
  const delBonus = async (b) => { await supabase.from("scheduled_bonus_grapes").delete().eq("id", b.id); load(); };
  const resolve = async (g, ok) => { await rpc("resolve_grape_request", { p_id: g.id, p_approve: ok }); reload(); load(); };

  const available = grapes.filter((g) => !g.used_at && new Date(g.expires_at) > new Date());

  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <div className="grid2">
        <div className="card"><div className="muted small">ענבים זמינים אצלה עכשיו</div><b style={{ fontSize: 24 }}>{available.length} 🍇</b></div>
        <div className="card stack">
          <div className="muted small">ענבים ביום</div>
          <div className="row">
            <button className="btn small soft" onClick={() => saveDaily(Math.max(0, settings.daily_grapes - 1))}>−</button>
            <b style={{ fontSize: 22 }}>{settings.daily_grapes}</b>
            <button className="btn small soft" onClick={() => saveDaily(settings.daily_grapes + 1)}>+</button>
          </div>
        </div>
      </div>

      <div className="card stack">
        <h3>ענב במתנה</h3>
        <input type="text" placeholder="סיבה קטנה (היא תראה את זה)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn" onClick={giveNow}>🍇 לשלוח עכשיו</button>
        <div className="hr" />
        <label className="field">או לתזמן (שעה אצלה)
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <button className="btn soft" onClick={schedule}>לתזמן ענב</button>
      </div>

      {bonus.filter((b) => !b.granted_grape_id).length > 0 && <h3>ענבים מתוזמנים</h3>}
      <div className="list">
        {bonus.filter((b) => !b.granted_grape_id).map((b) => (
          <div key={b.id} className="card row between" style={{ padding: 12 }}>
            <span>{fmtDateTime(b.grant_at, tz)} אצלה {b.note ? `· ${b.note}` : ""}</span>
            <button className="linkbtn" onClick={() => delBonus(b)}>ביטול</button>
          </div>
        ))}
      </div>

      {greqs.length > 0 && <h3>בקשות ענב</h3>}
      <div className="list">
        {greqs.map((g) => (
          <div key={g.id} className="card row between" style={{ padding: 12 }}>
            <div><div>{g.reason}</div><div className="muted small">{fmtDateTime(g.created_at, myTz)}</div></div>
            {g.status === "pending" ? (
              <div className="row"><button className="btn small" onClick={() => resolve(g, true)}>לאשר</button><button className="btn small ghost" onClick={() => resolve(g, false)}>לא</button></div>
            ) : <span className={`chip ${g.status === "approved" ? "ok" : ""}`}>{g.status === "approved" ? "אושר" : "נדחה"}</span>}
          </div>
        ))}
      </div>

      <h3>היסטוריה</h3>
      <table className="table">
        <thead><tr><th>סוג</th><th>ניתן</th><th>מצב</th></tr></thead>
        <tbody>
          {grapes.map((g) => (
            <tr key={g.id}>
              <td>{SOURCE[g.source]}</td>
              <td>{fmtDateTime(g.granted_at, myTz)}</td>
              <td>{g.used_at ? "נוצל ✓" : new Date(g.expires_at) < new Date() ? "פג" : "זמין"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
