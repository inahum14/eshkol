import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { mediaUrl, pickRecorderType, uploadMedia } from "../lib/media";

export function Sheet({ onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="sheet">
        <div className="grab" />
        {children}
      </div>
    </div>
  );
}

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => {
    setMsg(m);
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Progress({ value }) {
  return <div className="progress"><div style={{ width: `${Math.round((value || 0) * 100)}%` }} /></div>;
}

export const MEDIA_ICON = { video: "🎬", audio: "🎧", image: "🖼️", note: "💌" };

export function MediaView({ mediaType, mediaPath, body, autoPlay }) {
  return (
    <div className="media-box stack">
      {mediaType === "video" && mediaPath && (
        <video src={mediaUrl(mediaPath)} controls playsInline autoPlay={autoPlay} preload="metadata" />
      )}
      {mediaType === "audio" && mediaPath && <audio src={mediaUrl(mediaPath)} controls autoPlay={autoPlay} preload="metadata" />}
      {mediaType === "image" && mediaPath && <img src={mediaUrl(mediaPath)} alt="" />}
      {body && <div className="note-paper">{body}</div>}
    </div>
  );
}

/** Records audio with the mic. Calls onDone(blob). */
export function AudioRecorder({ onDone, maxSeconds = 300 }) {
  const [state, setState] = useState("idle");
  const [secs, setSecs] = useState(0);
  const [blob, setBlob] = useState(null);
  const recRef = useRef(null);
  const timer = useRef(null);
  const streamRef = useRef(null);

  const stop = () => {
    clearInterval(timer.current);
    if (recRef.current?.state === "recording") recRef.current.stop();
  };
  useEffect(() => () => { stop(); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const type = pickRecorderType("audio");
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunks, { type: (type || rec.mimeType || "audio/mp4").split(";")[0] });
        setBlob(b);
        setState("done");
        onDone?.(b);
      };
      recRef.current = rec;
      rec.start(500);
      setSecs(0);
      setState("rec");
      timer.current = setInterval(() => setSecs((s) => {
        if (s + 1 >= maxSeconds) stop();
        return s + 1;
      }), 1000);
    } catch {
      setState("error");
    }
  };

  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <div className="card soft stack">
      {state === "idle" && <button type="button" className="btn" onClick={start}>🎙️ להתחיל להקליט</button>}
      {state === "rec" && (
        <div className="row between">
          <span className="row"><span className="rec-dot" /> מקליט {mmss}</span>
          <button type="button" className="btn small danger" onClick={stop}>לעצור</button>
        </div>
      )}
      {state === "done" && blob && (
        <div className="stack">
          <audio src={URL.createObjectURL(blob)} controls />
          <button type="button" className="linkbtn" onClick={() => { setBlob(null); onDone?.(null); setState("idle"); }}>להקליט מחדש</button>
        </div>
      )}
      {state === "error" && <p className="err">אין גישה למיקרופון. צריך לאשר גישה בהגדרות.</p>}
    </div>
  );
}

export async function uploadWithProgress(blob, setProgress) {
  return uploadMedia(blob, (p) => setProgress?.(p));
}

export function Loading() {
  return <div className="empty">רגע… 🍇</div>;
}

export function useInterval(fn, ms) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
