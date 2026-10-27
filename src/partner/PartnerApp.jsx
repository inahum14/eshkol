import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, rpc } from "../lib/supabase";
import { daysUntil, timeLeft, myTz } from "../lib/time";
import { enablePush, pushStatus, isStandalone } from "../lib/push";
import { Sheet, useToast, MEDIA_ICON, SplashGate } from "../ui";
import Envelopes from "./Envelopes";
import ItemView from "./ItemView";
import Quizzes from "./Quizzes";
import MapJournal from "../shared/MapJournal";
import Emergency from "../shared/Emergency";
import TwoClocks from "../shared/TwoClocks";
import { WeeklyVideo, RequestFromYou, GrapeRequest, Vent, Archive } from "./Mine";

const TABS = [
  { id: "quiz", label: "חידות", ic: "🧩" },
  { id: "env", label: "מעטפות", ic: "💌" },
  { id: "home", label: "בית", ic: <PinHeart />, center: true },
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
    const { data: him } = await supabase.from("profiles").select("timezone").eq("role", "admin").maybeSingle();
    setD({ feed, grapes, streak, settings, quizzes, weekly, himTz: him?.timezone || "Asia/Jerusalem" });
  }, []);

  useEffect(() => {
    load();
    const onVis = () => document.visibilityState === "visible" && setTimeout(load, 600);
    document.addEventListener("visibilitychange", onVis);
    navigator.clearAppBadge?.().catch(() => {});
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  useEffect(() => { sessionStorage.setItem("tab", tab); window.scrollTo(0, 0); }, [tab]);

  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    pushStatus().then((st) => {
      let seen = false;
      try { seen = localStorage.getItem("eshkol-welcomed") === "1"; } catch { /* ignore */ }
      if (st === "off" && Notification.permission === "granted") enablePush().catch(() => {});
      else if (st === "off" && isStandalone() && !seen) setWelcome(true);
    });
  }, []);

  if (!d) return <SplashGate ready={false} />;

  const unreadCount = d.feed.filter((i) => i.kind !== "envelope" && !i.opened_at).length;
  const quizOpen = d.quizzes.filter((q) => !q.answered_at).length;

  return (
    <SplashGate ready>
    <div className="app">
      <div key={tab} className="page-anim">
      {tab === "home" && <Home me={me} d={d} reload={load} onOpen={setOpenItem} go={setTab} openSub={setSub} />}
      {tab === "env" && <Envelopes d={d} onOpen={setOpenItem} openSub={setSub} />}
      {tab === "quiz" && <Quizzes quizzes={d.quizzes} reload={load} />}
      {tab === "map" && <MapJournal canEdit />}
      {tab === "mine" && <Mine d={d} openSub={setSub} reload={load} />}
      </div>

      {openItem && (
        <ItemView item={openItem} grapes={d.grapes} onClose={() => { setOpenItem(null); load(); }}
          onNeedGrape={() => { setOpenItem(null); setSub("grape"); }} />
      )}
      {sub && (
        <Sheet onClose={() => setSub(null)}>
          {sub === "request" && <RequestFromYou done={() => setSub(null)} />}
          {sub === "streak" && <StreakInfo streak={d.streak} every={d.settings.streak_bonus_every} />}
          {sub === "grapes" && <GrapesInfo grapes={d.grapes} settings={d.settings} ask={() => setSub("grape")} />}
          {sub === "grape" && <GrapeRequest done={() => { setSub(null); load(); }} />}
          {sub === "weekly" && <WeeklyVideo weekly={d.weekly} done={() => { setSub(null); load(); }} />}
          {sub === "vent" && <Vent done={() => setSub(null)} />}
          {sub === "archive" && <Archive feed={d.feed} onOpen={(i) => { setSub(null); setOpenItem(i); }} />}
          {sub === "emergency" && <Emergency />}
        </Sheet>
      )}

      {welcome && <Welcome me={me} done={() => setWelcome(false)} />}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={`${tab === t.id ? "on" : ""} ${t.center ? "center-tab" : ""}`} onClick={() => setTab(t.id)}>
            <span className="ic">{t.ic}</span>{t.label}
            {t.id === "quiz" && quizOpen > 0 && <span className="badge">{quizOpen}</span>}
          </button>
        ))}
      </nav>
    </div>
    </SplashGate>
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
  const news = d.feed.filter((i) => i.kind !== "envelope");
  const unread = news.filter((i) => !i.opened_at);
  const latest = unread[0] || news[0];
  const quiz = d.quizzes.find((q) => !q.answered_at);

  return (
    <div className="stack">
      <div className="brand">אני כאן</div>
      <div className="topbar">
        <div>
          <div className="title">{greeting(myTz())}, {me.display_name}</div>
          <div className="muted">משהו קטן ממני, לכל הדרך</div>
        </div>
        <div className="pills">
          <button className="coin-pill" onClick={() => openSub("streak")} aria-label="רצף ימים">
            <span className="coin-ic">🔥</span><span className="coin-n">{d.streak.streak}</span>
          </button>
          <button className="coin-pill" onClick={() => openSub("grapes")} aria-label="הענבים שלי">
            <span className="coin-ic">🍇</span><span className="coin-n">{d.grapes.length}</span>
          </button>
        </div>
      </div>

      <TwoClocks otherTz={d.himTz} otherName="עידו" />


      {latest ? (
        <div className="card hero clickable hero-center" onClick={() => onOpen(latest)}>
          <span className="chip gold">{latest.opened_at ? "האחרון ממני" : "חדש ממני ✨"}</span>
          <div className="hero-ic">{MEDIA_ICON[latest.media_type]}</div>
          <h2>{latest.title}</h2>
          <button className="btn gold">{latest.opened_at ? "לראות שוב" : "לפתוח"}</button>
        </div>
      ) : (
        <div className="card hero hero-center">
          <div className="hero-ic">💌</div>
          <h2>עוד רגע יגיע לכאן משהו ממני</h2>
          <p className="muted" style={{ margin: 0 }}>בינתיים, מחכות לך מעטפות</p>
          <button className="btn gold" onClick={() => go("env")}>למעטפות</button>
        </div>
      )}

      {quiz && (
        <div className="card soft clickable quiz-teaser" onClick={() => go("quiz")}>
          <div className="qt-ic">🧩</div>
          <h3>חידה יומית חדשה</h3>
          <span className="chip gold">תשובה נכונה = ענב 🍇</span>
          <button className="btn">לענות</button>
        </div>
      )}

      {d.weekly.open && (
        <div className="card gold clickable" onClick={() => openSub("weekly")}>
          <b>🎥 הסרטון השבועי שלך</b>
          <p className="small">היום אפשר לשלוח לי סרטון קצר, עד דקה.</p>
        </div>
      )}

      {d.settings.home_quote && (
        <figure className="quote">
          <blockquote>{d.settings.home_quote}</blockquote>
        </figure>
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

function Mine({ d, openSub, reload }) {
  return (
    <div className="stack">
      <div className="env-head"><h1>הפינה שלי</h1><p>כל מה שצריך, במקום אחד</p></div>
      <ReturnClock settings={d.settings} reload={reload} />
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

function Welcome({ me, done }) {
  const [busy, setBusy] = useState(false);
  const finish = () => {
    try { localStorage.setItem("eshkol-welcomed", "1"); } catch { /* ignore */ }
    done();
  };
  const start = async () => {
    setBusy(true);
    try { await enablePush(); } catch { /* she can still use the app */ }
    finish();
  };
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <img src="/icons/icon-192.png" alt="" width="104" height="104" style={{ borderRadius: 28, margin: "0 auto" }} />
        <h1>היי {me.display_name} 💜</h1>
        <p>זה המקום הקטן שלנו לכל הטיול.<br />כאן יחכו לך הפתעות, מעטפות וחידות ממני.</p>
        <p className="muted">כדי שתדעי ברגע שמשהו מגיע, צריך לאשר התראות.</p>
        <button className="btn gold block" disabled={busy} onClick={start}>יאללה, מתחילים</button>
      </div>
    </div>
  );
}

function PinHeart() {
  return (
    <svg width="30" height="34" viewBox="0 0 30 34" aria-hidden="true">
      <path d="M15 33C15 33 2 20.5 2 12.5C2 5.6 7.8 1 15 1s13 4.6 13 11.5C28 20.5 15 33 15 33Z" fill="#F0C96A" />
      <path d="M15 18.6c-.3 0-4.6-2.8-4.6-5.6 0-1.5 1.1-2.6 2.5-2.6.9 0 1.6.5 2.1 1.2.5-.7 1.2-1.2 2.1-1.2 1.4 0 2.5 1.1 2.5 2.6 0 2.8-4.3 5.6-4.6 5.6Z" fill="#3E1157" />
    </svg>
  );
}

function GrapesInfo({ grapes, settings, ask }) {
  const now = new Date();
  const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
  const hrs = Math.floor((midnight - now) / 3600000);
  const mins = Math.floor(((midnight - now) % 3600000) / 60000);
  const SRC = { daily: "ענב יומי", bonus: "ענב במתנה", quiz: "פרס על חידה", request: "ענב שביקשת" };
  return (
    <div className="stack">
      <div className="center">
        <div style={{ fontSize: 46 }}>🍇</div>
        <h2 style={{ margin: 0 }}>{grapes.length ? `יש לך ${grapes.length} ענבים` : "אין כרגע ענבים"}</h2>
        <p className="muted">כל מעטפה נפתחת עם ענב אחד</p>
      </div>
      <div className="card soft center">
        <div className="muted small">הענב הבא מגיע</div>
        <b style={{ fontSize: 20 }}>בעוד {hrs} שע׳ ו-{mins} דק׳</b>
        <div className="muted small">כל לילה בחצות · {settings.daily_grapes > 1 ? `${settings.daily_grapes} ענבים ביום` : "ענב אחד ביום"}</div>
      </div>
      {grapes.length > 0 && (
        <div className="list">
          {grapes.map((g) => (
            <div key={g.id} className="item" style={{ cursor: "default" }}>
              <span className="grape" />
              <div className="grow"><div className="t">{SRC[g.source] || "ענב"}</div><div className="muted small">{timeLeft(g.expires_at)} עד שהוא פג</div></div>
            </div>
          ))}
        </div>
      )}
      <p className="muted small center">ענב שלא משתמשים בו נשאר 72 שעות.</p>
      <button className="btn block" onClick={ask}>לבקש ענב נוסף</button>
    </div>
  );
}

function StreakInfo({ streak, every }) {
  const n = streak.streak;
  const toNext = every > 0 ? (n % every === 0 && n > 0 ? every : every - (n % every)) : 0;
  return (
    <div className="stack center">
      <div style={{ fontSize: 52, lineHeight: 1 }}>🔥</div>
      <h2 style={{ margin: 0 }}>{n ? `רצף של ${n} ${n === 1 ? "יום" : "ימים"}` : "עוד אין רצף"}</h2>
      <p>זה הרצף שלך: כמה ימים ברציפות נכנסת ופתחת משהו ממני.</p>
      <div className="card soft">
        <b>ככל שהרצף ארוך יותר, מרוויחים יותר ענבים 🍇</b>
        {every > 0 && <p className="small" style={{ margin: "6px 0 0" }}>כל {every} ימים ברצף, מחכה לך ענב במתנה.</p>}
      </div>
      {every > 0 && (
        <div className="streak-track">
          {Array.from({ length: every }).map((_, i) => (
            <span key={i} className={i < (n % every || (n ? every : 0)) ? "on" : ""}>{i === every - 1 ? "🍇" : ""}</span>
          ))}
        </div>
      )}
      {every > 0 && <p className="muted small">{toNext === 1 ? "עוד יום אחד לענב הבא!" : `עוד ${toNext} ימים לענב הבא`}</p>}
      <p className="muted small">{streak.today_done ? "היום כבר נספר ✓" : "כדי שהיום ייספר, מספיק לפתוח דבר אחד ממני."}</p>
    </div>
  );
}
