import { useCallback, useEffect, useState } from "react";
import { supabase, rpc } from "../lib/supabase";
import { fmtDateTime } from "../lib/time";
import { enablePush, pushStatus } from "../lib/push";
import { mediaUrl } from "../lib/media";
import { useToast, useInterval, SplashGate, MEDIA_ICON } from "../ui";
import Compose from "./Compose";
import ContentList from "./ContentList";
import QuizAdmin from "./QuizAdmin";
import GrapesAdmin from "./GrapesAdmin";
import SettingsAdmin from "./SettingsAdmin";
import MapJournal from "../shared/MapJournal";
import TwoClocks from "../shared/TwoClocks";

const TABS = [
  { id: "inbox", label: "אצלי", ic: "📥" },
  { id: "content", label: "תוכן", ic: "🎬" },
  { id: "new", label: "חדש", ic: <span className="plus">＋</span>, center: true },
  { id: "quiz", label: "חידות", ic: "🧩" },
  { id: "more", label: "עוד", ic: "⚙️" },
];
const TITLES = { content: "התוכן שלך", quiz: "חידות", new: "תוכן חדש", grapes: "ענבים", map: "המסלול שלה", settings: "הגדרות", more: "עוד" };
const myTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function ago(iso) {
  if (!iso) return "עוד לא נכנסה";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 2) return "פעילה עכשיו";
  if (m < 60) return `פעילה לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return `פעילה לפני ${h} שע׳`;
  return `פעילה לפני ${Math.round(h / 24)} ימים`;
}

export default function AdminApp({ me }) {
  const [nav, setNav] = useState(() => sessionStorage.getItem("anav") || "inbox");
  const [d, setD] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [, tick] = useState(0);
  useInterval(() => tick((x) => x + 1), 30000);

  const load = useCallback(async () => {
    const q = (p) => p.then((r) => r.data || []);
    const nowIso = new Date().toISOString();
    const [partner, vents, reqs, greqs, replies, weekly, views, grapes, streak, envelopes, scheduled, quizzes] = await Promise.all([
      supabase.from("profiles").select("*").eq("role", "partner").maybeSingle().then((r) => r.data),
      q(supabase.from("vent_messages").select("*").order("created_at", { ascending: false }).limit(50)),
      q(supabase.from("content_requests").select("*").order("created_at", { ascending: false }).limit(50)),
      q(supabase.from("grape_requests").select("*").order("created_at", { ascending: false }).limit(30)),
      q(supabase.from("replies").select("*, content_items(title)").order("created_at", { ascending: false }).limit(30)),
      q(supabase.from("weekly_videos").select("*").order("created_at", { ascending: false }).limit(12)),
      q(supabase.from("content_views").select("opened_at, content_items(title, media_type, kind)").order("opened_at", { ascending: false }).limit(6)),
      q(supabase.from("grapes").select("id").is("used_at", null).gt("expires_at", nowIso)),
      rpc("streak_info").catch(() => ({ streak: 0 })),
      q(supabase.from("content_items").select("id, content_views(opened_at)").eq("kind", "envelope")),
      q(supabase.from("content_items").select("id").eq("kind", "scheduled").gt("unlock_at", nowIso)),
      q(supabase.from("quizzes").select("id").gt("unlock_at", nowIso)),
    ]);
    setD({
      partner, vents, reqs, greqs, replies, weekly, views, streak,
      grapes: grapes.length,
      stock: { envelopes: envelopes.filter((e) => !e.content_views?.length).length, scheduled: scheduled.length, quizzes: quizzes.length },
    });
  }, []);

  useEffect(() => {
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    navigator.clearAppBadge?.().catch(() => {});
    const ch = supabase.channel("admin").on("postgres_changes", { event: "INSERT", schema: "public" }, () => load()).subscribe();
    return () => { document.removeEventListener("visibilitychange", onVis); supabase.removeChannel(ch); };
  }, [load]);

  useEffect(() => { sessionStorage.setItem("anav", nav); window.scrollTo(0, 0); }, [nav]);

  if (!d) return <SplashGate ready={false} />;

  const pending = d.vents.filter((v) => !v.answered_at).length + d.reqs.filter((r) => r.status === "pending").length +
    d.greqs.filter((g) => g.status === "pending").length;
  const go = (id) => { if (id !== "new") setPrefill(null); setNav(id); };
  const answer = (p) => { setPrefill(p); setNav("new"); };
  const tabOf = ["grapes", "map", "settings"].includes(nav) ? "more" : nav;

  return (
    <SplashGate ready>
      <div className="app admin">
        <div key={nav} className="page-anim">
          {nav === "inbox" ? (
            <Dashboard me={me} d={d} reload={load} answer={answer} go={go} />
          ) : (
            <>
              <div className="page-head">
                {["grapes", "map", "settings"].includes(nav) && <button className="back" onClick={() => go("more")}>‹ עוד</button>}
                <h1>{prefill?.requestId ? "תשובה לבקשה" : prefill?.ventId ? "תשובה לפריקה" : TITLES[nav]}</h1>
              </div>
              {nav === "new" && <Compose key={prefill?.key || "new"} prefill={prefill} partner={d.partner} done={() => { setPrefill(null); load(); go("content"); }} />}
              {nav === "content" && <ContentList partner={d.partner} />}
              {nav === "quiz" && <QuizAdmin partner={d.partner} />}
              {nav === "grapes" && <GrapesAdmin partner={d.partner} greqs={d.greqs} reload={load} />}
              {nav === "map" && <MapJournal canEdit={false} />}
              {nav === "settings" && <SettingsAdmin />}
              {nav === "more" && <More go={go} pendingGrapes={d.greqs.filter((g) => g.status === "pending").length} />}
            </>
          )}
        </div>

        <nav className="tabbar">
          {TABS.map((t) => (
            <button key={t.id} className={`${tabOf === t.id ? "on" : ""} ${t.center ? "center-tab" : ""}`} onClick={() => go(t.id)}>
              <span className="ic">{t.ic}</span>{t.label}
              {t.id === "inbox" && pending > 0 && <span className="badge">{pending}</span>}
            </button>
          ))}
        </nav>
      </div>
    </SplashGate>
  );
}

function Dashboard({ me, d, reload, answer, go }) {
  const toast = useToast();
  const [push, setPush] = useState("on");
  useEffect(() => { pushStatus().then(setPush); }, []);
  const tz = myTz();
  const p = d.partner;

  const urgent = d.vents.filter((v) => v.urgent && !v.answered_at);
  const calmVents = d.vents.filter((v) => !v.urgent && !v.answered_at);
  const pendReqs = d.reqs.filter((r) => r.status === "pending");
  const pendGrapes = d.greqs.filter((g) => g.status === "pending");
  const freshReplies = d.replies.filter((r) => !r.seen_by_admin_at).slice(0, 8);

  const markVent = async (v) => {
    await supabase.from("vent_messages").update({ answered_at: new Date().toISOString(), read_at: v.read_at || new Date().toISOString() }).eq("id", v.id);
    reload();
  };
  const resolveGrape = async (g, ok) => {
    await rpc("resolve_grape_request", { p_id: g.id, p_approve: ok });
    toast(ok ? "ענב נשלח 🍇" : "נדחה");
    reload();
  };
  const seenReply = async (r) => { await supabase.from("replies").update({ seen_by_admin_at: new Date().toISOString() }).eq("id", r.id); reload(); };

  const stock = [
    { k: "envelopes", n: d.stock.envelopes, label: "מעטפות סגורות", low: 4, to: "content", ic: "💌" },
    { k: "scheduled", n: d.stock.scheduled, label: "הפתעות מתוזמנות", low: 3, to: "content", ic: "⏰" },
    { k: "quizzes", n: d.stock.quizzes, label: "חידות קדימה", low: 3, to: "quiz", ic: "🧩" },
  ];
  const nothing = !urgent.length && !pendGrapes.length && !pendReqs.length && !freshReplies.length && !calmVents.length;

  return (
    <div className="stack">
      <div className="brand">אני כאן</div>
      <div className="topbar">
        <div>
          <div className="title">היי {me?.display_name || "עידו"}</div>
          <div className="muted">עופרי · {ago(p?.last_active_at)}</div>
        </div>
        <div className="pills">
          <div className="coin-pill" title="הרצף שלה"><span className="coin-ic">🔥</span><span className="coin-n">{d.streak?.streak ?? 0}</span></div>
          <button className="coin-pill" onClick={() => go("grapes")} title="הענבים שלה"><span className="coin-ic">🍇</span><span className="coin-n">{d.grapes}</span></button>
        </div>
      </div>

      {p && <TwoClocks otherTz={p.timezone} otherName="עופרי" />}

      {push !== "on" && push !== "unsupported" && (
        <div className="card gold center stack">
          <b>להפעיל התראות אצלך</b>
          <p className="small" style={{ margin: 0 }}>כדי שתדע מיד כשהיא מבקשת, מגיבה או צריכה אותך.</p>
          <button className="btn" onClick={async () => { try { await enablePush(); setPush("on"); toast("פועל ✓"); } catch (e) { toast(e.message); } }}>להפעיל</button>
        </div>
      )}

      {urgent.map((v) => (
        <div key={v.id} className="card urgent-card stack">
          <div className="row between"><b>עידו, תקרא את זה</b><span className="muted small">{fmtDateTime(v.created_at, tz)}</span></div>
          <p className="vent-body">{v.body}</p>
          <div className="row wrap">
            <button className="btn small" onClick={() => answer({ key: v.id, kind: "live", media_type: "audio", title: "בשבילך 💜", ventId: v.id })}>לענות לה</button>
            <button className="btn small soft" onClick={() => markVent(v)}>✓ טופל</button>
          </div>
        </div>
      ))}

      <div className="stock">
        {stock.map((s) => (
          <button key={s.k} className={`stock-tile ${s.n < s.low ? "low" : ""}`} onClick={() => go(s.to)}>
            <span className="st-ic">{s.ic}</span>
            <b>{s.n}</b>
            <span>{s.label}</span>
            {s.n < s.low && <em>כדאי להוסיף</em>}
          </button>
        ))}
      </div>

      {pendGrapes.length > 0 && <h3 className="sec">🍇 בקשות ענב</h3>}
      {pendGrapes.map((g) => (
        <div key={g.id} className="card stack">
          <div className="row between"><span>{g.reason}</span><span className="muted small">{fmtDateTime(g.created_at, tz)}</span></div>
          <div className="row"><button className="btn small" onClick={() => resolveGrape(g, true)}>לאשר 🍇</button><button className="btn small ghost" onClick={() => resolveGrape(g, false)}>לא הפעם</button></div>
        </div>
      ))}

      {pendReqs.length > 0 && <h3 className="sec">🙏 היא ביקשה ממך</h3>}
      {pendReqs.map((r) => (
        <div key={r.id} className="card stack">
          <div className="row between"><span>{r.request_text}</span><span className="muted small">{fmtDateTime(r.created_at, tz)}</span></div>
          <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => answer({ key: r.id, kind: "request_answer", media_type: "video", title: r.request_text.slice(0, 60), requestId: r.id })}>לענות לה</button>
        </div>
      ))}

      {freshReplies.length > 0 && <h3 className="sec">💬 תגובות חדשות</h3>}
      {freshReplies.map((r) => (
        <div key={r.id} className="card stack">
          <div className="muted small">על "{r.content_items?.title}" · {fmtDateTime(r.created_at, tz)}</div>
          {r.text_body && <div className="vent-body">{r.text_body}</div>}
          {r.media_path && <audio src={mediaUrl(r.media_path)} controls />}
          <button className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={() => seenReply(r)}>✓ ראיתי</button>
        </div>
      ))}

      {calmVents.length > 0 && <h3 className="sec">💜 היא רצתה לפרוק</h3>}
      {calmVents.map((v) => (
        <div key={v.id} className="card stack">
          <div className="muted small">{fmtDateTime(v.created_at, tz)}</div>
          <div className="vent-body">{v.body}</div>
          <div className="row"><button className="btn small soft" onClick={() => markVent(v)}>✓ טופל</button>
            <button className="btn small ghost" onClick={() => answer({ key: v.id, kind: "live", media_type: "audio", title: "בשבילך 💜", ventId: v.id })}>לענות</button></div>
        </div>
      ))}

      {nothing && <div className="card center calm">שקט כאן 💜<br /><span className="muted small">כשהיא תבקש, תגיב או תכתוב, זה יופיע פה.</span></div>}

      {d.weekly.length > 0 && <h3 className="sec">🎥 הסרטונים השבועיים שלה</h3>}
      {d.weekly.length > 0 && (
        <div className="weekly-row">
          {d.weekly.map((w) => (
            <div key={w.id} className="stack center">
              <div className="round-cam playback" style={{ width: 132, height: 132, borderWidth: 3 }}>
                <video src={mediaUrl(w.media_path)} controls playsInline preload="metadata" />
              </div>
              <span className="muted small">{fmtDateTime(w.created_at, tz)}</span>
            </div>
          ))}
        </div>
      )}

      {d.views.length > 0 && <h3 className="sec">👀 מה היא פתחה לאחרונה</h3>}
      {d.views.length > 0 && (
        <div className="card activity">
          {d.views.map((v, i) => (
            <div key={i} className="act-row">
              <span>{MEDIA_ICON[v.content_items?.media_type] || "💌"} {v.content_items?.title}</span>
              <span className="muted small">{fmtDateTime(v.opened_at, tz)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function More({ go, pendingGrapes }) {
  const rows = [
    { id: "grapes", ic: "🍇", t: "ענבים", s: pendingGrapes ? `${pendingGrapes} בקשות מחכות` : "כמות יומית, מתנות ובקשות" },
    { id: "map", ic: "📍", t: "המסלול שלה", s: "יעדים וחוויות" },
    { id: "settings", ic: "⚙️", t: "הגדרות", s: "שעון חזרה, שעות שקטות, תזכורות, משפט מצחיק, חירום" },
  ];
  return (
    <div className="stack">
      <div className="list">
        {rows.map((r) => (
          <div key={r.id} className="item" onClick={() => go(r.id)}>
            <div className="ico">{r.ic}</div>
            <div className="grow"><div className="t">{r.t}</div><div className="muted small">{r.s}</div></div>
            <span className="muted">‹</span>
          </div>
        ))}
      </div>
      <div className="center" style={{ marginTop: 18 }}>
        <button className="linkbtn" onClick={() => supabase.auth.signOut()}>התנתקות</button>
      </div>
    </div>
  );
}
