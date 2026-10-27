import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { uploadMedia, compressVideo, compressImage } from "../lib/media";
import { wallToDate, dateToWall, fmtDateTime } from "../lib/time";
import { AudioRecorder, Progress, useToast, Sheet, MEDIA_ICON } from "../ui";
import { ENVELOPE_CATEGORIES, catOf } from "../partner/Envelopes";

export const PRE_OPEN_PRESETS = ["כדאי לראות לבד 💜", "שימי אוזניות 🎧", "חפשי מקום שקט", "אולי תצטרכי טישו 🥲", "רק כשאת במצב טוב ☀️"];

export const NOTIF_SUGGESTIONS = {
  live: ["הזמנה ממני 💌", "חשבתי עלייך עכשיו 💜", "יש לך משהו ממני ✨", "רגע קטן בשבילך 🫶"],
  scheduled: ["הפתעה חדשה ממני 🍇", "נפתח לך משהו מיוחד ✨", "היום מחכה לך הפתעה 💌"],
  request_answer: ["מה שביקשת ממני 💜", "הבקשה שלך כאן 🎁"],
};

const KINDS = [
  { id: "live", label: "לשלוח עכשיו" },
  { id: "scheduled", label: "מתוזמן" },
  { id: "envelope", label: "מעטפה" },
];
const TYPES = [
  { id: "video", label: "🎬 סרטון" },
  { id: "audio", label: "🎧 הקלטה" },
  { id: "image", label: "🖼️ תמונה" },
  { id: "note", label: "💌 פתק" },
];

export default function Compose({ prefill, partner, done }) {
  const tz = partner?.timezone || "America/Argentina/Buenos_Aires";
  const [kind, setKind] = useState(prefill?.kind || "live");
  const [mediaType, setMediaType] = useState(prefill?.media_type || "video");
  const [title, setTitle] = useState(prefill?.title || "");
  const [body, setBody] = useState("");
  const [file, setFile] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioMode, setAudioMode] = useState("record");
  const [category, setCategory] = useState("miss");
  const [unlock, setUnlock] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    return dateToWall(d, tz).slice(0, 11) + "10:00";
  });
  const [preOn, setPreOn] = useState(false);
  const [pre, setPre] = useState(PRE_OPEN_PRESETS[0]);
  const [replyOn, setReplyOn] = useState(false);
  const [replyTypes, setReplyTypes] = useState(["text", "audio"]);
  const [notif, setNotif] = useState(NOTIF_SUGGESTIONS[prefill?.kind || "live"]?.[0] || "");
  const [notifEdited, setNotifEdited] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => { if (!notifEdited) setNotif(NOTIF_SUGGESTIONS[kind]?.[0] || ""); }, [kind, notifEdited]);
  const [phase, setPhase] = useState(null);
  const [prog, setProg] = useState(0);
  const [err, setErr] = useState("");
  const toast = useToast();

  const isRequestAnswer = kind === "request_answer";
  const needsFile = mediaType === "video" || mediaType === "image" || (mediaType === "audio" && audioMode === "file");
  const blob = mediaType === "audio" && audioMode === "record" ? audioBlob : file;
  const valid = title.trim() && (mediaType === "note" ? body.trim() : !!blob) && (kind !== "scheduled" || unlock);

  const submit = async () => {
    setErr("");
    try {
      let media = null;
      if (mediaType !== "note") {
        let up = blob;
        if (mediaType === "video" && up.size > 25 * 1024 * 1024) {
          setPhase("מכווץ את הסרטון (לוקח בערך כאורך הסרטון, להשאיר את המסך פתוח)…");
          setProg(0);
          up = await compressVideo(up, setProg);
        }
        if (mediaType === "image") up = await compressImage(up);
        setPhase("מעלה…"); setProg(0);
        media = await uploadMedia(up, setProg);
      }
      setPhase("שומר…");
      const unlockAt = kind === "scheduled" ? wallToDate(unlock, tz).toISOString() : null;
      const { data, error } = await supabase.from("content_items").insert({
        kind, media_type: mediaType, title: title.trim(), body: body.trim() || null, media_path: media,
        envelope_category: kind === "envelope" ? category : null,
        unlock_at: unlockAt,
        pre_open_message: preOn ? pre.trim() || null : null,
        allow_reply: replyOn, reply_types: replyOn ? replyTypes : [],
        notif_title: kind === "envelope" ? null : notif.trim() || null,
      }).select().single();
      if (error) throw error;
      if (prefill?.requestId) {
        await supabase.from("content_requests").update({ status: "answered", answer_item_id: data.id }).eq("id", prefill.requestId);
      }
      if (prefill?.ventId) {
        await supabase.from("vent_messages").update({ answered_at: new Date().toISOString() }).eq("id", prefill.ventId);
      }
      toast(kind === "envelope" ? "המעטפה נוספה 💌" : kind === "scheduled" ? "תוזמן ✓" : "נשלח אליה 💜");
      done();
    } catch (e) {
      console.error(e);
      setErr("משהו השתבש: " + (e.message || ""));
    }
    setPhase(null);
  };

  const toggleType = (t) => setReplyTypes((rs) => rs.includes(t) ? rs.filter((x) => x !== t) : [...rs, t]);

  return (
    <div className="stack">
      {isRequestAnswer && <div className="card soft small">היא ביקשה: "{prefill.title}"</div>}

      <div className="card stack">
      <div className="step">1 · איך זה מגיע אליה</div>
      {!isRequestAnswer && (
        <div className="seg">
          {KINDS.map((k) => <button key={k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>{k.label}</button>)}
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        {kind === "live" && "יגיע אליה עכשיו עם התראה (בשעות השקטות שלה, ההתראה תחכה לבוקר)."}
        {kind === "scheduled" && "ייפתח אצלה בזמן שתבחר, עם התראה."}
        {kind === "envelope" && "נכנס למאגר המעטפות. היא פותחת מתי שתרצה, עם ענב."}
        {kind === "request_answer" && "יגיע אליה עכשיו עם התראה."}
      </p>
      {kind === "envelope" && (
        <label className="field">לפתוח כש…
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {ENVELOPE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.e} {c.label}</option>)}
          </select>
        </label>
      )}
      {kind === "scheduled" && (
        <label className="field">מתי ייפתח, לפי השעה <b>אצלה</b>
          <input type="datetime-local" value={unlock} onChange={(e) => setUnlock(e.target.value)} />
          {unlock && <span className="small">= אצלך: {fmtDateTime(wallToDate(unlock, tz).toISOString(), Intl.DateTimeFormat().resolvedOptions().timeZone)}</span>}
        </label>
      )}
      {kind !== "envelope" && (
        <div className="field">נוסח ההתראה שהיא תקבל
          <input type="text" value={notif} onChange={(e) => { setNotif(e.target.value); setNotifEdited(true); }} />
          <div className="chips">
            {(NOTIF_SUGGESTIONS[kind] || []).map((n) => (
              <span key={n} className={`chip select ${notif === n ? "on" : ""}`} onClick={() => { setNotif(n); setNotifEdited(true); }}>{n}</span>
            ))}
          </div>
        </div>
      )}
      </div>

      <div className="card stack">
      <div className="step">2 · מה שולחים</div>
      <div className="chips">
        {TYPES.map((t) => <span key={t.id} className={`chip select ${mediaType === t.id ? "on" : ""}`} onClick={() => setMediaType(t.id)}>{t.label}</span>)}
      </div>

      <label className="field">כותרת (מה שהיא רואה לפני שפותחת)
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="בוקר טוב מתל אביב" />
      </label>

      {mediaType === "audio" && (
        <div className="seg">
          <button className={audioMode === "record" ? "on" : ""} onClick={() => setAudioMode("record")}>🎙️ להקליט כאן</button>
          <button className={audioMode === "file" ? "on" : ""} onClick={() => setAudioMode("file")}>📁 קובץ</button>
        </div>
      )}
      {mediaType === "audio" && audioMode === "record" && <AudioRecorder onDone={setAudioBlob} maxSeconds={600} />}
      {needsFile && (
        <label className="btn ghost">
          {file ? `✓ ${file.name || "נבחר"} (${Math.round(file.size / 1024 / 1024)}MB)` : mediaType === "video" ? "🎬 לבחור / לצלם סרטון" : mediaType === "image" ? "🖼️ לבחור תמונה" : "📁 לבחור קובץ שמע"}
          <input type="file" hidden accept={mediaType === "video" ? "video/*" : mediaType === "image" ? "image/*" : "audio/*"} onChange={(e) => setFile(e.target.files[0])} />
        </label>
      )}

      <label className="field">{mediaType === "note" ? "הפתק" : "טקסט נלווה (לא חובה)"}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} />
      </label>

      </div>

      <div className="card stack">
        <div className="step">3 · תוספות</div>
        <label className="check"><input type="checkbox" checked={preOn} onChange={(e) => setPreOn(e.target.checked)} /> הודעה לפני פתיחה</label>
        {preOn && (
          <>
            <div className="chips">{PRE_OPEN_PRESETS.map((p) => <span key={p} className={`chip select ${pre === p ? "on" : ""}`} onClick={() => setPre(p)}>{p}</span>)}</div>
            <input type="text" value={pre} onChange={(e) => setPre(e.target.value)} />
          </>
        )}
        <div className="hr" style={{ margin: "4px 0" }} />
        <label className="check"><input type="checkbox" checked={replyOn} onChange={(e) => setReplyOn(e.target.checked)} /> לאפשר לה להגיב</label>
        {replyOn && (
          <div className="row">
            <label className="check"><input type="checkbox" checked={replyTypes.includes("text")} onChange={() => toggleType("text")} /> טקסט קצר</label>
            <label className="check"><input type="checkbox" checked={replyTypes.includes("audio")} onChange={() => toggleType("audio")} /> הקלטה קולית</label>
          </div>
        )}
      </div>

      {phase && <div className="stack"><span className="small">{phase}</span><Progress value={prog} /></div>}
      {err && <p className="err">{err}</p>}
      <button className="btn ghost block" disabled={!title.trim()} onClick={() => setPreview(true)}>👀 לראות כמו עופרי</button>
      {preview && (
        <AsHer onClose={() => setPreview(false)} kind={kind} mediaType={mediaType} title={title} body={body} blob={blob}
          pre={preOn ? pre : null} notif={kind === "envelope" ? null : notif} category={category} reply={replyOn ? replyTypes : null} />
      )}
      <button className="btn block" disabled={!valid || !!phase || (replyOn && !replyTypes.length)} onClick={submit}>
        {kind === "envelope" ? "להוסיף מעטפה" : kind === "scheduled" ? "לתזמן" : "לשלוח אליה"}
      </button>
    </div>
  );
}

/** Shows exactly what she'll see: the notification, the card in her app, and the opened content. */
function AsHer({ onClose, kind, mediaType, title, body, blob, pre, notif, category, reply }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  const c = catOf(category);
  return (
    <Sheet onClose={onClose}>
      <div className="stack as-her">
        <h2 className="center" style={{ margin: 0 }}>ככה זה ייראה אצלה</h2>

        {notif && (
          <>
            <div className="ah-label">🔔 ההתראה</div>
            <div className="ah-notif">
              <img src="/icons/icon-192.png" alt="" />
              <div><b>{notif}</b><div>{title}</div></div>
              <span>{kind === "scheduled" ? "בזמן שקבעת" : "עכשיו"}</span>
            </div>
          </>
        )}

        <div className="ah-label">📱 באפליקציה שלה</div>
        {kind === "envelope" ? (
          <div className="ah-env">
            <button className="envelope" type="button">
              <div className="env-art"><div className="flap" /><div className="seal">♥</div></div>
              <div className="env-title">{title}</div>
              <div className="env-sub">{c.e} {c.label}</div>
            </button>
          </div>
        ) : (
          <div className="card hero hero-center">
            <span className="chip gold">חדש ממני ✨</span>
            <div className="hero-ic">{MEDIA_ICON[mediaType]}</div>
            <h2>{title}</h2>
            <span className="btn gold">לפתוח</span>
          </div>
        )}

        {pre && (
          <>
            <div className="ah-label">💜 לפני שנפתח</div>
            <div className="card center"><h3 style={{ margin: 0 }}>{pre}</h3><span className="btn small" style={{ marginTop: 8 }}>אני מוכנה</span></div>
          </>
        )}

        <div className="ah-label">✨ כשהיא פותחת</div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>{title}</h3>
          {mediaType === "video" && url && <video src={url} controls playsInline style={{ width: "100%", borderRadius: 14 }} />}
          {mediaType === "audio" && url && <audio src={url} controls style={{ width: "100%" }} />}
          {mediaType === "image" && url && <img src={url} alt="" style={{ borderRadius: 14 }} />}
          {mediaType !== "note" && !url && <div className="muted small center">עוד לא בחרת קובץ</div>}
          {body && <div className="note-paper">{body}</div>}
          {reply && <div className="muted small">מתחת: אפשרות להגיב ב{reply.map((r) => (r === "text" ? "טקסט" : "הקלטה")).join(" או ")}</div>}
        </div>
        <button className="btn block" onClick={onClose}>חזרה לעריכה</button>
      </div>
    </Sheet>
  );
}
