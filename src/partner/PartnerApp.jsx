import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, rpc } from "../lib/supabase";
import { daysUntil, timeLeft, myTz } from "../lib/time";
import { enablePush, pushStatus, isStandalone } from "../lib/push";
import { Sheet, useToast, MEDIA_ICON, Loading } from "../ui";
import Envelopes from "./Envelopes";
import ItemView from "./ItemView";
import Quizzes from "./Quizzes";
import MapJournal from "../shared/MapJournal";
import Emergency from "../shared/Emergency";
import { WeeklyVideo, RequestFromYou, GrapeRequest, Vent, Archive } from "./Mine";

const TABS = [
  { id: "home", label: "בית", ic: "🍇" },
  { id: "env", label: "מעטפות", ic: "💌" },
  { id: "quiz", label: "חידות", ic: "🧩" },
  { id: "map", label: "מפה", ic: "📍" },
  { id: "mine", label: "שלי", ic: "💜" },
];

export default function PartnerApp({ me }) {
  const [tab, setTab] = useState(() => sessionStorage.getItem("tab") || "home");
  const [d, setD] = useState(null);
  const [openItem, setOpenItem] = useState(null);
  const [sub, setSub] = useState(null);

  const load = useCallback(async () => {
    const [feed, grapes, streak, settings, quizzes, weekly] = await Promise.all([
      rpc("partner_feed"),
      rpc("available_grapes"),
      rpc("streak_info"),
      supabase.from("settings").select("*").eq("id", 1).single().then((r) => r.data),
      rpc("partner_quizzes"),
      rpc("weekly_video_window"),
    ]);
    setD({ feed, grapes, streak, settings, quizzes, weekly });
  }, []);

  useEffect(() => {
    load();
    const onVis = () => document.visibilityState === "visible" && setTimeout(load, 600);
    document.addEventListener("visibilitychange", onVis);
    navigator.clearAppBadge?.().catch(() => {});
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  useEffect(() => { sessionStorage.setItem("tab", tab); window.scrollTo(0, 0); }, [tab]);

  if (!d) return <div className="app"><Loading /></div>;

  const unreadCount = d.feed.filter((i) => i.kind !== "envelope" && !i.opened_at).length;
  const quizOpen = d.quizzes.filter((q) => !q.answered_at).length;

  return (
    <div className="app">
      {tab === "home" && <Home me={me} d={d} reload={load} onOpen={setOpenItem} go={setTab} openSub={setSub} />}
      {tab === "env" && <Envelopes d={d} onOpen={setOpenItem} openSub={setSub} />}
      {tab === "quiz" && <Quizzes quizzes={d.quizzes} reload={load} />}
      {tab === "map" && <MapJournal canEdit />}
      {tab === "mine" && <Mine d={d} openSub={setSub} />}

      {openItem && (
        <ItemView item={openItem} grapes={d.grapes} onClose={() => { setOpenItem(null); load(); }}
          onNeedGrape={() => { setOpenItem(null); setSub("grape"); }} />
      )}
      {sub && (
        <Sheet onClose={() => setSub(null)}>
          {sub === "request" && <RequestFromYou done={() => setSub(null)} />}
          {sub === "grape" && <GrapeRequest done={() => { setSub(null); load(); }} />}
          {sub === "weekly" && <WeeklyVideo weekly={d.weekly} done={() => { setSub(null); load(); }} />}
          {sub === "vent" && <Vent done={() => setSub(null)} />}
          {sub === "archive" && <Archive feed={d.feed} onOpen={(i) => { setSub(null); setOpenItem(i); }} />}
          {sub === "emergency" && <Emergency />}
        </Sheet>
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            <span className="ic">{t.ic}</span>{t.label}
            {t.id === "home" && unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            {t.id === "quiz" && quizOpen > 0 && <span className="badge">{quizOpen}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

function greeting(tz) {
  const h = +new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date());
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

function Home({ me, d, reload, onOpen, go, openSub }) {
  const toast = useToast();
  const [push, setPush] = useState("on");
  useEffect(() => { pushStatus().then(setPush); }, []);

  const news = d.feed.filter((i) => i.kind !== "envelope");
  const unread = news.filter((i) => !i.opened_at);
  const latest = unread[0] || news[0];
  const openedCount = d.feed.filter((i) => i.opened_at).length;
  const quiz = d.quizzes.find((q) => !q.answered_at);

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <div className="title">{greeting(myTz())}, {me.display_name}</div>
          <div className="muted">משהו קטן ממני, לכל הדרך</div>
        </div>
      </div>

      {push !== "on" && push !== "unsupported" && (
        <div className="card gold stack">
          <b>להפעיל התראות?</b>
          <p className="small">ככה תדעי מיד כשמחכה לך משהו ממני.</p>
          {push === "denied"
            ? <p className="small">ההתראות חסומות. אפשר להפעיל ב: הגדרות ← התראות ← אשכול.</p>
            : <button className="btn" onClick={async () => {
                try { await enablePush(); setPush("on"); toast("ההתראות פועלות 💜"); }
                catch (e) { toast(e.message); }
              }}>להפעיל התראות</button>}
          {!isStandalone() && <p className="small muted">טיפ: התראות עובדות רק כשפותחים מהאייקון במסך הבית.</p>}
        </div>
      )}

      <ReturnClock settings={d.settings} reload={reload} />

      {latest ? (
        <div className={`card hero clickable`} onClick={() => onOpen(latest)}>
          <div className="row between">
            <span className="chip gold">{latest.opened_at ? "האחרון ממני" : "חדש ממני ✨"}</span>
            <span style={{ fontSize: 28 }}>{MEDIA_ICON[latest.media_type]}</span>
          </div>
          <h2 style={{ marginTop: 12 }}>{latest.title}</h2>
          <button className="btn gold" style={{ marginTop: 8 }}>{latest.opened_at ? "לראות שוב" : "לפתוח"}</button>
        </div>
      ) : (
        <div className="card hero"><h3>עוד מעט יגיע לפה משהו ממני 💜</h3><p className="muted">בינתיים, מחכות לך מעטפות.</p></div>
      )}

      <div className="grid2">
        <div className="card clickable" onClick={() => go("env")}>
          <div className="muted small">ענבים לפתיחת מעטפות</div>
          <div className="grapes-row" style={{ margin: "8px 0" }}>
            {d.grapes.length ? d.grapes.map((g) => <span key={g.id} className="grape" />) : <span className="grape empty" />}
          </div>
          <div className="small">{d.grapes.length ? timeLeft(d.grapes[0].expires_at) + " לענב הקרוב" : "אין כרגע ענבים"}</div>
        </div>
        <div className="card">
          <div className="muted small">רצף ימים</div>
          <div className="streak">🔥 {d.streak.streak}</div>
          <div className="small">{d.streak.today_done ? "היום כבר נספר ✓" : "עוד לא היום"}</div>
        </div>
      </div>

      {quiz && (
        <div className="card soft clickable" onClick={() => go("quiz")}>
          <div className="row between"><b>🧩 חידה חדשה מחכה</b><span className="chip gold">+ ענב</span></div>
          <p className="small" style={{ marginTop: 6 }}>{quiz.question}</p>
        </div>
      )}

      {d.weekly.open && (
        <div className="card gold clickable" onClick={() => openSub("weekly")}>
          <b>🎥 הסרטון השבועי שלך</b>
          <p className="small">היום אפשר לשלוח לי סרטון קצר, עד דקה.</p>
        </div>
      )}

      {unread.length > 1 && (
        <div className="stack">
          <h3>עוד דברים שמחכים</h3>
          <div className="list">
            {unread.slice(1).map((i) => (
              <div key={i.id} className="item unread" onClick={() => onOpen(i)}>
                <div className="ico">{MEDIA_ICON[i.media_type]}</div>
                <div className="grow"><div className="t">{i.title}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Cluster count={openedCount} />
    </div>
  );
}

function Cluster({ count }) {
  const rows = useMemo(() => {
    const shape = [3, 4, 5, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1];
    let left = count;
    return shape.map((n) => {
      const on = Math.max(0, Math.min(n, left));
      left -= on;
      return { n, on };
    });
  }, [count]);
  return (
    <div className="card center">
      <div className="muted small">האשכול שלנו</div>
      <div className="cluster">
        <div style={{ fontSize: 18, marginBottom: -4 }}>🌿</div>
        {rows.slice(0, Math.max(4, (rows.findIndex((r) => r.on < r.n) + 1 || rows.length + 1) + 1)).map((r, i) => (
          <div className="r" key={i}>{Array.from({ length: r.n }).map((_, j) => <span key={j} className={`g ${j < r.on ? "" : "off"}`} />)}</div>
        ))}
      </div>
      <div className="small">{count} ענבים באשכול</div>
    </div>
  );
}

function ReturnClock({ settings, reload }) {
  const [date, setDate] = useState("");
  const [edit, setEdit] = useState(false);
  const toast = useToast();
  if (!settings.return_clock_enabled) return null;
  const save = async () => {
    try { await rpc("set_return_date", { p_date: date }); setEdit(false); toast("נשמר ✈️"); reload(); }
    catch { toast("לא הצלחתי לשמור"); }
  };
  if (!settings.return_date || edit) {
    return (
      <div className="card gold stack">
        <b>✈️ מתי את חוזרת?</b>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn" disabled={!date} onClick={save}>לשמור</button>
      </div>
    );
  }
  const n = daysUntil(settings.return_date);
  return (
    <div className="card gold center" onClick={() => { setDate(settings.return_date); setEdit(true); }}>
      <div className="muted small">עד שנתראה</div>
      <div className="countdown">{n > 0 ? n : "🎉"}</div>
      <div className="small">{n > 1 ? "ימים" : n === 1 ? "יום אחד!" : "היום!"}</div>
    </div>
  );
}

function Mine({ d, openSub }) {
  return (
    <div className="stack">
      <div className="topbar"><div className="title">שלי</div></div>
      <div className="list">
        <Row ic="🙏" t="בקשה ממך" s="רוצה משהו מסוים? תכתבי לי" onClick={() => openSub("request")} />
        <Row ic="🍇" t="לבקש ענב" s="עם סיבה קטנה" onClick={() => openSub("grape")} />
        <Row ic="🎥" t="הסרטון השבועי" s={d.weekly.open ? "פתוח עכשיו" : d.weekly.sent_this_week ? "נשלח השבוע ✓" : "נפתח בשישי"} onClick={() => openSub("weekly")} />
        <Row ic="🗂️" t="כל מה שקיבלת" s="ארכיון" onClick={() => openSub("archive")} />
        <Row ic="🆘" t="מספרי חירום" s="לפי מדינה" onClick={() => openSub("emergency")} />
      </div>
      <div className="center" style={{ marginTop: 24 }}>
        <button className="vent-btn" onClick={() => openSub("vent")}>צריכה לפרוק?</button>
      </div>
      <div className="center" style={{ marginTop: 18 }}>
        <button className="linkbtn" onClick={() => supabase.auth.signOut()}>התנתקות</button>
      </div>
    </div>
  );
}

function Row({ ic, t, s, onClick }) {
  return (
    <div className="item" onClick={onClick}>
      <div className="ico">{ic}</div>
      <div className="grow"><div className="t">{t}</div><div className="muted small">{s}</div></div>
      <span className="muted">‹</span>
    </div>
  );
}
