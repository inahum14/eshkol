import { useEffect, useState } from "react";
import { supabase, usernameToEmail, rpc, SUPABASE_URL, SUPABASE_KEY } from "./lib/supabase";
import { myTz } from "./lib/time";
import { isStandalone } from "./lib/push";
import { Loading } from "./ui";
import PartnerApp from "./partner/PartnerApp";
import AdminApp from "./admin/AdminApp";

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    let alive = true;
    const checkIn = () => rpc("check_in", { p_timezone: myTz() }).catch(() => {});
    (async () => {
      await checkIn();
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (alive) setProfile(data);
    })();
    const onVis = () => document.visibilityState === "visible" && checkIn();
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(checkIn, 5 * 60 * 1000);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); clearInterval(t); };
  }, [session?.user?.id]);

  if (session === undefined) return <div className="app"><Loading /></div>;
  if (!session) return location.hash.startsWith("#/setup") ? <Setup /> : <Login />;
  if (!profile) return <div className="app"><Loading /></div>;
  return profile.role === "admin" ? <AdminApp me={profile} /> : <PartnerApp me={profile} />;
}

function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const needsInstall = isIOS() && !isStandalone();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(u), password: p });
    if (error) setErr("שם משתמש או סיסמה לא נכונים");
    setBusy(false);
  };

  return (
    <div className="app">
      <div className="center" style={{ marginTop: "8vh" }}>
        <img src="/icons/icon-192.png" alt="" width="96" height="96" style={{ borderRadius: 24, margin: "0 auto 16px" }} />
        <h1>אשכול</h1>
        <p className="muted">משהו קטן ממני, לכל הדרך</p>
      </div>
      {needsInstall && (
        <div className="card gold" style={{ marginTop: 20 }}>
          <h3>רגע לפני שנכנסים</h3>
          <p className="small">כדי שהכניסה תישמר ושיגיעו התראות, קודם מוסיפים למסך הבית:</p>
          <ol className="small" style={{ paddingInlineStart: 18, margin: 0 }}>
            <li>לוחצים על כפתור השיתוף <b>⬆︎</b> בתחתית Safari</li>
            <li>בוחרים <b>"הוספה למסך הבית"</b></li>
            <li>פותחים את <b>אשכול</b> מהאייקון החדש ומתחברים משם</li>
          </ol>
        </div>
      )}
      <form className="card stack" style={{ marginTop: 20 }} onSubmit={submit}>
        <label className="field">שם משתמש
          <input type="text" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} dir="ltr" />
        </label>
        <label className="field">סיסמה
          <input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} dir="ltr" />
        </label>
        {err && <p className="err">{err}</p>}
        <button className="btn block" disabled={busy || !u || !p}>כניסה</button>
      </form>
    </div>
  );
}

function Setup() {
  const [code, setCode] = useState("");
  const [ido, setIdo] = useState("");
  const [ofri, setOfri] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    const r = await fetch(`${SUPABASE_URL}/functions/v1/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ code, ido_password: ido, ofri_password: ofri }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setOk(true); else setMsg(j.error || "משהו השתבש");
  };
  if (ok) return (
    <div className="app"><div className="card stack" style={{ marginTop: "10vh" }}>
      <h2>מוכן ✅</h2>
      <p>המשתמשים נוצרו: <b dir="ltr">ido</b> ו-<b dir="ltr">ofri</b>.</p>
      <button className="btn" onClick={() => { location.hash = ""; location.reload(); }}>לכניסה</button>
    </div></div>
  );
  return (
    <div className="app">
      <form className="card stack" style={{ marginTop: "6vh" }} onSubmit={submit}>
        <h2>הגדרה ראשונית</h2>
        <p className="muted">פעם אחת בלבד: קובעים סיסמאות לשניכם.</p>
        <label className="field">קוד הגדרה<input type="text" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" /></label>
        <label className="field">סיסמה לעידו (ido)<input type="text" value={ido} onChange={(e) => setIdo(e.target.value)} dir="ltr" /></label>
        <label className="field">סיסמה לעופרי (ofri)<input type="text" value={ofri} onChange={(e) => setOfri(e.target.value)} dir="ltr" /></label>
        {msg && <p className="err">{msg}</p>}
        <button className="btn block" disabled={!code || ido.length < 6 || ofri.length < 6}>יצירת משתמשים</button>
        <p className="muted small">לפחות 6 תווים לכל סיסמה.</p>
      </form>
    </div>
  );
}
