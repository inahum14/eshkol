import { useEffect, useState } from "react";
import { rpc } from "../lib/supabase";
import { Sheet, MediaView, AudioRecorder, useToast, Progress, MEDIA_ICON } from "../ui";
import { uploadMedia } from "../lib/media";

/**
 * Opening flow: (pre-open message → "אני מוכנה") → spend grape if envelope → show content → optional reply.
 */
export default function ItemView({ item, grapes, onClose, onNeedGrape }) {
  const [stage, setStage] = useState(item.opened_at ? "view" : item.pre_open_message ? "pre" : item.kind === "envelope" ? "confirm" : "opening");
  const [full, setFull] = useState(item.opened_at ? item : null);
  const [err, setErr] = useState("");

  const open = async () => {
    setStage("opening");
    try {
      const r = await rpc("open_item", { p_item: item.id });
      if (r && r.ok === false && r.reason === "no_grapes") { setStage("nograpes"); return; }
      const feed = await rpc("partner_feed");
      setFull(feed.find((x) => x.id === item.id));
      setStage("view");
    } catch (e) {
      setErr("לא הצלחתי לפתוח, נסי שוב");
      setStage("confirm");
    }
  };

  useEffect(() => { if (stage === "opening" && !full) open(); }, []); // eslint-disable-line

  return (
    <Sheet onClose={onClose}>
      {stage === "pre" && (
        <div className="stack center" style={{ padding: "20px 0" }}>
          <div style={{ fontSize: 44 }}>💜</div>
          <h2>{item.pre_open_message}</h2>
          <p className="muted">{item.title}</p>
          <button className="btn block" onClick={() => (item.kind === "envelope" ? setStage("confirm") : open())}>אני מוכנה</button>
          <button className="linkbtn" onClick={onClose}>אחר כך</button>
        </div>
      )}
      {stage === "confirm" && (
        <div className="stack center" style={{ padding: "20px 0" }}>
          <div style={{ fontSize: 44 }}>✉️</div>
          <h2>{item.title}</h2>
          <p>לפתוח את המעטפה עם ענב אחד?</p>
          <p className="muted small">יש לך {grapes.length} ענבים</p>
          {err && <p className="err">{err}</p>}
          {grapes.length ? (
            <button className="btn block" onClick={open}>🍇 לפתוח</button>
          ) : (
            <>
              <p className="err">אין כרגע ענבים</p>
              <button className="btn block soft" onClick={onNeedGrape}>לבקש ענב</button>
            </>
          )}
          <button className="linkbtn" onClick={onClose}>לא עכשיו</button>
        </div>
      )}
      {stage === "nograpes" && (
        <div className="stack center" style={{ padding: "20px 0" }}>
          <p>נגמרו הענבים 🍇</p>
          <button className="btn block soft" onClick={onNeedGrape}>לבקש ענב</button>
        </div>
      )}
      {stage === "opening" && <div className="empty">פותחת… {MEDIA_ICON[item.media_type]}</div>}
      {stage === "view" && full && (
        <div className="stack">
          <h2>{full.title}</h2>
          <MediaView mediaType={full.media_type} mediaPath={full.media_path} body={full.body} autoPlay />
          {full.allow_reply && <Reply item={full} />}
          <button className="btn ghost block" onClick={onClose}>סגירה</button>
        </div>
      )}
    </Sheet>
  );
}

function Reply({ item }) {
  const types = item.reply_types || [];
  const [mode, setMode] = useState(types[0]);
  const [text, setText] = useState("");
  const [blob, setBlob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [sent, setSent] = useState(item.my_reply_count > 0);
  const toast = useToast();

  if (sent) return <div className="card soft center">✓ התגובה שלך נשלחה 💜</div>;

  const send = async () => {
    setBusy(true);
    try {
      let media = null;
      if (mode === "audio") media = await uploadMedia(blob, setProg);
      await rpc("send_reply", { p_item: item.id, p_type: mode, p_text: mode === "text" ? text : null, p_media: media });
      setSent(true);
      toast("נשלח 💜");
    } catch {
      toast("לא נשלח, נסי שוב");
    }
    setBusy(false);
  };

  return (
    <div className="card stack">
      <b>רוצה להגיב?</b>
      {types.length > 1 && (
        <div className="seg">
          {types.includes("text") && <button className={mode === "text" ? "on" : ""} onClick={() => setMode("text")}>✍️ טקסט</button>}
          {types.includes("audio") && <button className={mode === "audio" ? "on" : ""} onClick={() => setMode("audio")}>🎙️ הקלטה</button>}
        </div>
      )}
      {mode === "text" && <textarea placeholder="מה עובר לך בראש…" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />}
      {mode === "audio" && <AudioRecorder onDone={setBlob} maxSeconds={180} />}
      {busy && mode === "audio" && <Progress value={prog} />}
      <button className="btn" disabled={busy || (mode === "text" ? !text.trim() : !blob)} onClick={send}>לשלוח</button>
    </div>
  );
}
