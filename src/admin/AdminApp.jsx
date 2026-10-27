import { useCallback, useEffect, useState } from "react";
import { supabase, rpc } from "../lib/supabase";
import { fmtClock, fmtDateTime } from "../lib/time";
import { enablePush, pushStatus } from "../lib/push";
import { mediaUrl } from "../lib/media";
import { useToast, useInterval, Loading } from "../ui";
import Compose from "./Compose";
import ContentList from "./ContentList";
import QuizAdmin from "./QuizAdmin";
import GrapesAdmin from "./GrapesAdmin";
import SettingsAdmin from "./SettingsAdmin";
import MapJournal from "../shared/MapJournal";

const NAV = [
  { id: "inbox", label: "📥 אצלי" },
  { id: "new", label: "＋ חדש" },
  { id: "content", label: "🎬 תוכן" },
  { id: "quiz", label: "🧩 חידות" },
  { id: "grapes", label: "🍇 ענבים" },
  { id: "map", label: "📍 מפה" },
  { id: "settings", label: "⚙️ הגדרות" },
];

export default function AdminApp() {
  const [nav, setNav] = useState(() => sessionStorage.getItem("anav") || "inbox");
  const [partner, setPartner] = useState(null);
  const [inbox, setInbox] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [, tick] = useState(0);
  useInterval(() => tick((x) => x + 1), 30000);

  const load = useCallback(async () => {
    const [p, vents, reqs, greqs, replies, weekly] = await Promise.all([
      supabase.from("profiles").select("*").eq("role", "partner").maybeSingle().then((r) => r.data),
      supabase.from("vent_messages").select("*").order("created_at", { ascending: false }).limit(50).then((r) => r.data || []),
      supabase.from("content_requests").select("*").order("created_at", { ascending: false }).limit(50).then((r) => r.data || []),
      supabase.from("grape_requests").select("*").order("created_at", { ascending: false }).limit(30).then((r) => r.data || []),
      supabase.from("replies").select("*, content_items(title)").order("created_at", { ascending: false }).limit(50).then((r) => r.data || []),
      supabase.from("weekly_videos").select("*").order("created_at", { ascending: false }).limit(30).then((r) => r.data || []),
    ]);
    setPartner(p);
    setInbox({ vents, reqs, greqs, replies, weekly });
  }, []);

  useEffect(() => {
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    navigator.clearAppBadge?.().catch(() => {});
    const ch = supabase.channel("admin")
      .on("postgres_changes", { event: "INSERT", schema: "public" }, () => load())
      .subscribe();
    return () => { document.removeEventListener("visibilitychange", onVis); supabase.removeChannel(ch); };
  }, [load]);

  useEffect(() => { sessionStorage.setItem("anav", nav); window.scrollTo(0, 0); }, [nav]);

  if (!inbox) return <div className="app"><Loading /></div>;
  const pending = inbox.vents.filter((v) => !v.answered_at).length + inbox.reqs.filter((r) => r.status === "pending").length +
    inbox.greqs.filter((g) => g.status === "pending").length;

  const answer = (p) => { setPrefill(p); setNav("new"); };

  return (
    <div className="app wide">
      <div className="topbar">
        <div>
          <div className="title">אני כאן · ניהול</div>
          {partner && <div className="muted small">אצל עופרי עכשיו: <b>{fmtClock(partner.timezone)}</b> ({partner.timezone.split("/").pop().replace(/_/g, " ")})</div>}
          {partner?.last_active_at && <div className="muted small">פעילה לאחרונה: {fmtDateTime(partner.last_active_at, Intl.DateTimeFormat().resolvedOptions().timeZone)}</div>}
        </div>
      </div>
      <div className="admin-nav">
        {NAV.map((n) => (
          <button key={n.id} className={nav === n.id ? "on" : ""} onClick={() => { if (n.id !== "new") setPrefill(null); setNav(n.id); }}>
            {n.label}{n.id === "inbox" && pending > 0 ? ` (${pending})` : ""}
          </button>
        ))}
      </div>
      {nav === "inbox" && <Inbox inbox={inbox} reload={load} answer={answer} />}
      {nav === "new" && <Compose key={prefill?.key || "new"} prefill={prefill} partner={partner} done={() => { setPrefill(null); load(); setNav("content"); }} />}
      {nav === "content" && <ContentList partner={partner} />}
      {nav === "quiz" && <QuizAdmin partner={partner} />}
      {nav === "grapes" && <GrapesAdmin partner={partner} greqs={inbox.greqs} reload={load} />}
      {nav === "map" && <MapJournal canEdit={false} />}
      {nav === "settings" && <SettingsAdmin />}
    </div>
  );
}

function Inbox({ inbox, reload, answer }) {
  const toast = useToast();
  const [push, setPush] = useState("on");
  useEffect(() => { pushStatus().then(setPush); }, []);
  const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const urgent = inbox.vents.filter((v) => v.urgent && !v.answered_at);
  const otherVents = inbox.vents.filter((v) => !(v.urgent && !v.answered_at));
  const pendReqs = inbox.reqs.filter((r) => r.status === "pending");
  const pendGrapes = inbox.greqs.filter((g) => g.status === "pending");

  const markVent = async (v) => {
    await supabase.from("vent_messages").update({ answered_at: new Date().toISOString(), read_at: v.read_at || new Date().toISOString() }).eq("id", v.id);
    reload();
  };
  const resolveGrape = async (g, ok) => {
    await rpc("resolve_grape_request", { p_id: g.id, p_approve: ok });
    toast(ok ? "ענב נשלח 🍇" : "נדחה");
    reload();
  };

  return (
    <div className="stack">
      {push !== "on" && (
        <div className="card gold stack">
          <b>להפעיל התראות אצלך</b>
          <p className="small">כדי שתדע מיד כשהיא מבקשת, מגיבה או צריכה אותך.</p>
          <button className="btn" onClick={async () => { try { await enablePush(); setPush("on"); toast("פועל ✓"); } catch (e) { toast(e.message); } }}>להפעיל</button>
        </div>
      )}

      {urgent.map((v) => (
        <div key={v.id} className="item urgent" style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
          <div className="row between"><b style={{ color: "var(--bad)" }}>עידו, תקרא את זה</b><span className="muted small">{fmtDateTime(v.created_at, myTz)}</span></div>
          <p style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>{v.body}</p>
          <div className="row wrap">
            <button className="btn small" onClick={() => answer({ key: v.id, kind: "live", media_type: "audio", title: "בשבילך 💜", ventId: v.id })}>לענות באפליקציה</button>
            <button className="btn small soft" onClick={() => markVent(v)}>✓ טופל</button>
          </div>
        </div>
      ))}

      {pendGrapes.length > 0 && <h3>🍇 בקשות ענב</h3>}
      {pendGrapes.map((g) => (
        <div key={g.id} className="card row between">
          <div><div>{g.reason}</div><div className="muted small">{fmtDateTime(g.created_at, myTz)}</div></div>
          <div className="row">
            <button className="btn small" onClick={() => resolveGrape(g, true)}>לאשר</button>
            <button className="btn small ghost" onClick={() => resolveGrape(g, false)}>לא הפעם</button>
          </div>
        </div>
      ))}

      {pendReqs.length > 0 && <h3>🙏 בקשות ממך</h3>}
      {pendReqs.map((r) => (
        <div key={r.id} className="card row between">
          <div><div>{r.request_text}</div><div className="muted small">{fmtDateTime(r.created_at, myTz)}</div></div>
          <button className="btn small" onClick={() => answer({ key: r.id, kind: "request_answer", media_type: "video", title: r.request_text.slice(0, 60), requestId: r.id })}>לענות</button>
        </div>
      ))}

      {inbox.weekly.length > 0 && <h3>🎥 הסרטונים השבועיים שלה</h3>}
      <div className="row wrap">
        {inbox.weekly.slice(0, 6).map((w) => (
          <div key={w.id} className="stack center">
            <div className="round-cam playback" style={{ width: 150, height: 150, borderWidth: 3 }}>
              <video src={mediaUrl(w.media_path)} controls playsInline preload="metadata" />
            </div>
            <span className="muted small">{fmtDateTime(w.created_at, myTz)}</span>
          </div>
        ))}
      </div>

      {inbox.replies.length > 0 && <h3>💬 תגובות שלה</h3>}
      <div className="list">
        {inbox.replies.slice(0, 15).map((r) => (
          <div key={r.id} className="card stack" style={{ padding: 12 }}>
            <div className="muted small">על "{r.content_items?.title}" · {fmtDateTime(r.created_at, myTz)}</div>
            {r.text_body && <div style={{ whiteSpace: "pre-wrap" }}>{r.text_body}</div>}
            {r.media_path && <audio src={mediaUrl(r.media_path)} controls />}
          </div>
        ))}
      </div>

      {otherVents.length > 0 && <h3>💜 פריקה</h3>}
      <div className="list">
        {otherVents.slice(0, 20).map((v) => (
          <div key={v.id} className="card stack" style={{ padding: 12 }}>
            <div className="row between">
              <span className={`chip ${v.urgent ? "bad" : ""}`}>{v.urgent ? "דחוף" : "לא דחוף"}</span>
              <span className="muted small">{fmtDateTime(v.created_at, myTz)}</span>
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{v.body}</div>
            {!v.answered_at && <div className="row"><button className="btn small soft" onClick={() => markVent(v)}>✓ טופל</button>
              <button className="btn small ghost" onClick={() => answer({ key: v.id, kind: "live", media_type: "audio", title: "בשבילך 💜", ventId: v.id })}>לענות</button></div>}
          </div>
        ))}
      </div>

      {!urgent.length && !pendGrapes.length && !pendReqs.length && !inbox.replies.length && !inbox.vents.length && !inbox.weekly.length && (
        <div className="empty">שקט כאן. כשהיא תבקש, תגיב או תשלח משהו, זה יופיע פה.</div>
      )}
    </div>
  );
}
