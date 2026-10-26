import { useEffect, useRef, useState } from "react";
import { supabase, rpc } from "../lib/supabase";
import { uploadMedia, pickRecorderType, mediaUrl } from "../lib/media";
import { Progress, useToast, MEDIA_ICON } from "../ui";
import { fmtDate, fmtDateTime, myTz } from "../lib/time";

/* ---------- weekly round video ---------- */
export function WeeklyVideo({ weekly, done }) {
  const [past, setPast] = useState([]);
  useEffect(() => {
    supabase.from("weekly_videos").select("*").order("created_at", { ascending: false }).then((r) => setPast(r.data || []));
  }, []);
  return (
    <div className="stack">
      <h2>🎥 הסרטון השבועי</h2>
      {weekly.open ? <RoundRecorder done={done} /> : (
        <div className="card soft center">
          {weekly.sent_this_week ? "הסרטון של השבוע כבר אצלי 💜" : "הסרטון השבועי נפתח ביום שישי (ואם לא הספקת, גם בשבת)."}
        </div>
      )}
      {past.length > 0 && <h3>מה ששלחת עד עכשיו</h3>}
      <div className="grid2">
        {past.map((v) => (
          <div key={v.id} className="stack center">
            <div className="round-cam playback" style={{ width: 140, height: 140, borderWidth: 3 }}>
              <video src={mediaUrl(v.media_path)} controls playsInline preload="metadata" />
            </div>
            <span className="muted small">{fmtDate(v.created_at, myTz())}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoundRecorder({ done }) {
  const [state, setState] = useState("idle");
  const [secs, setSecs] = useState(60);
  const [blob, setBlob] = useState(null);
  const [prog, setProg] = useState(0);
  const vref = useRef(null);
  const stream = useRef(null);
  const rec = useRef(null);
  const timer = useRef(null);
  const toast = useToast();

  const cleanup = () => { clearInterval(timer.current); stream.current?.getTracks().forEach((t) => t.stop()); };
  useEffect(() => cleanup, []);

  const startCam = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } }, audio: true,
      });
      vref.current.srcObject = stream.current;
      vref.current.muted = true;
      await vref.current.play();
      setState("ready");
    } catch { setState("error"); }
  };
  const start = () => {
    const type = pickRecorderType("video");
    const r = new MediaRecorder(stream.current, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 1_500_000 });
    const chunks = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      const b = new Blob(chunks, { type: (type || r.mimeType || "video/mp4").split(";")[0] });
      setBlob(b);
      cleanup();
      setState("review");
    };
    rec.current = r;
    r.start(1000);
    setSecs(60);
    setState("rec");
    timer.current = setInterval(() => setSecs((s) => {
      if (s <= 1) { r.state === "recording" && r.stop(); return 0; }
      return s - 1;
    }), 1000);
  };
  const stop = () => { clearInterval(timer.current); rec.current?.state === "recording" && rec.current.stop(); };
  const send = async () => {
    setState("sending");
    try {
      const key = await uploadMedia(blob, setProg);
      await rpc("submit_weekly_video", { p_media: key });
      toast("נשלח! 💜");
      done();
    } catch { toast("לא נשלח, נסי שוב"); setState("review"); }
  };

  return (
    <div className="stack center">
      <div className={`round-cam ${state === "review" || state === "sending" ? "playback" : ""}`}>
        {state === "review" || state === "sending"
          ? <video src={URL.createObjectURL(blob)} controls playsInline style={{ transform: "scaleX(-1)" }} />
          : <video ref={vref} playsInline muted />}
      </div>
      {state === "idle" && <button className="btn" onClick={startCam}>📷 להדליק מצלמה</button>}
      {state === "ready" && <button className="btn" onClick={start}>⏺ להתחיל (עד דקה)</button>}
      {state === "rec" && (
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="rec-dot" /> <b>{secs}</b> שניות
          <button className="btn small danger" onClick={stop}>לעצור</button>
        </div>
      )}
      {state === "review" && (
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={send}>לשלוח לעידו</button>
          <button className="btn ghost" onClick={() => { setBlob(null); setState("idle"); }}>מחדש</button>
        </div>
      )}
      {state === "sending" && <div style={{ width: "100%" }}><Progress value={prog} /><p className="muted small">שולחת…</p></div>}
      {state === "error" && <p className="err">אין גישה למצלמה. צריך לאשר בהגדרות.</p>}
    </div>
  );
}

/* ---------- request content from him ---------- */
export function RequestFromYou({ done }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState([]);
  const toast = useToast();
  useEffect(() => {
    supabase.from("content_requests").select("*").order("created_at", { ascending: false }).limit(20).then((r) => setList(r.data || []));
  }, []);
  const send = async () => {
    setBusy(true);
    const { error } = await supabase.from("content_requests").insert({ request_text: text.trim() });
    setBusy(false);
    if (error) return toast("לא נשלח");
    toast("הבקשה אצלי 💜");
    done();
  };
  return (
    <div className="stack">
      <h2>🙏 בקשה ממך</h2>
      <p className="muted">מה בא לך לקבל ממני? סרטון, שיר, סיפור, מתכון… אני אענה.</p>
      <textarea placeholder="תספר לי על…" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn" disabled={busy || !text.trim()} onClick={send}>לשלוח</button>
      {list.length > 0 && <><div className="hr" /><h3>בקשות קודמות</h3></>}
      <div className="list">
        {list.map((r) => (
          <div key={r.id} className="item" style={{ cursor: "default" }}>
            <div className="ico">{r.status === "answered" ? "✅" : "⏳"}</div>
            <div className="grow"><div>{r.request_text}</div><div className="muted small">{r.status === "answered" ? "נענתה" : "מחכה לתשובה"}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- ask for a grape ---------- */
export function GrapeRequest({ done }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(null);
  const toast = useToast();
  useEffect(() => {
    supabase.from("grape_requests").select("*").eq("status", "pending").limit(1).then((r) => setPending(r.data?.[0] || false));
  }, []);
  const send = async () => {
    const { error } = await supabase.from("grape_requests").insert({ reason: reason.trim() });
    if (error) return toast("לא נשלח");
    toast("ביקשת ענב 🍇");
    done();
  };
  return (
    <div className="stack">
      <h2>🍇 לבקש ענב</h2>
      {pending ? (
        <div className="card soft">כבר יש בקשה שמחכה לי: "{pending.reason}"</div>
      ) : (
        <>
          <p className="muted">למה צריך עוד ענב היום?</p>
          <textarea placeholder="היה לי יום ארוך…" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn" disabled={!reason.trim()} onClick={send}>לבקש</button>
        </>
      )}
    </div>
  );
}

/* ---------- vent ---------- */
export function Vent({ done }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const toast = useToast();
  const send = async (urgent) => {
    setBusy(true);
    const { error } = await supabase.from("vent_messages").insert({ body: text.trim(), urgent });
    setBusy(false);
    if (error) return toast("לא נשלח, נסי שוב");
    setSent(urgent ? "urgent" : "calm");
  };
  if (sent) return (
    <div className="stack center" style={{ padding: "24px 0" }}>
      <div style={{ fontSize: 44 }}>💜</div>
      <h2>{sent === "urgent" ? "זה אצלי עכשיו." : "קיבלתי."}</h2>
      <p>{sent === "urgent" ? "אני קורא ועונה לך הכי מהר שאני יכול." : "אני כאן, ואחזור אלייך."}</p>
      <button className="btn ghost" onClick={done}>סגירה</button>
    </div>
  );
  return (
    <div className="stack">
      <h2>צריכה לפרוק?</h2>
      <div className="card soft">
        <p><b>כאן זה רק בשבילך.</b></p>
        <p>אפשר לכתוב לי הכול, כמה שתרצי ובכל שעה. מה שתכתבי פה מגיע אליי מיד, גם באמצע הלילה, ואני אעשה הכול כדי לענות מהר ולהיות שם בשבילך.</p>
        <p style={{ margin: 0 }}>הכפתור הזה נועד לרגעים שבהם קרה משהו, משהו שיושב עלייך ואת לא רוצה להחזיק אותו לבד.</p>
      </div>
      <textarea style={{ minHeight: 180 }} placeholder="אני פה…" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn soft block" disabled={busy || !text.trim()} onClick={() => send(false)}>לא דחוף, רק רציתי לפרוק 💜</button>
      <button className="btn block" disabled={busy || !text.trim()} onClick={() => send(true)}>עידו, תקרא את זה</button>
    </div>
  );
}

/* ---------- archive ---------- */
export function Archive({ feed, onOpen }) {
  const opened = feed.filter((i) => i.opened_at);
  return (
    <div className="stack">
      <h2>🗂️ כל מה שקיבלת</h2>
      {!opened.length && <div className="empty">עוד אין כאן כלום</div>}
      <div className="list">
        {opened.map((i) => (
          <div key={i.id} className="item" onClick={() => onOpen(i)}>
            <div className="ico">{MEDIA_ICON[i.media_type]}</div>
            <div className="grow"><div className="t">{i.title}</div><div className="muted small">{fmtDateTime(i.opened_at, myTz())}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
