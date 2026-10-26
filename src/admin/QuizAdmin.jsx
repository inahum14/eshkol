import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { uploadMedia, compressVideo } from "../lib/media";
import { wallToDate, dateToWall, fmtDateTime } from "../lib/time";
import { AudioRecorder, Progress, useToast } from "../ui";

const LETTERS = ["א", "ב", "ג", "ד"];

export default function QuizAdmin({ partner }) {
  const tz = partner?.timezone || "America/Argentina/Buenos_Aires";
  const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [quizzes, setQuizzes] = useState(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const load = async () => {
    const { data } = await supabase.from("quizzes").select("*").order("unlock_at", { ascending: false });
    setQuizzes(data || []);
  };
  useEffect(() => { load(); }, []);
  if (!quizzes) return null;

  const last = quizzes[0];
  const nextSlot = () => {
    const base = last && new Date(last.unlock_at) > new Date() ? new Date(last.unlock_at) : new Date();
    const d = new Date(base.getTime() + 2 * 86400000);
    return dateToWall(d, tz).slice(0, 11) + "10:00";
  };
  const del = async (q) => {
    if (!confirm("למחוק את החידה?")) return;
    await supabase.from("quizzes").delete().eq("id", q.id);
    if (q.explanation_item_id) await supabase.from("content_items").delete().eq("id", q.explanation_item_id);
    toast("נמחק"); load();
  };

  const future = quizzes.filter((q) => new Date(q.unlock_at) > new Date()).length;
  return (
    <div className="stack">
      <div className="card soft row between">
        <span>{future} חידות מתוזמנות קדימה · {quizzes.filter((q) => q.is_correct).length}/{quizzes.filter((q) => q.answered_at).length} נכונות</span>
        {!creating && <button className="btn small" onClick={() => setCreating(true)}>＋ חידה</button>}
      </div>
      {creating && <NewQuiz tz={tz} defaultUnlock={nextSlot()} done={() => { setCreating(false); load(); }} />}
      <div className="list">
        {quizzes.map((q) => (
          <div key={q.id} className="card stack" style={{ padding: 12 }}>
            <div className="row between">
              <b>{q.question}</b>
              {q.answered_at ? <span className={`chip ${q.is_correct ? "ok" : "bad"}`}>{q.is_correct ? "צדקה" : `ענתה ${LETTERS[q.chosen_index]}`}</span>
                : new Date(q.unlock_at) > new Date() ? <span className="chip">מתוזמן</span> : <span className="chip gold">פתוח</span>}
            </div>
            <div className="small">{q.options.map((o, i) => <span key={i} style={{ marginInlineEnd: 12, fontWeight: i === q.correct_index ? 700 : 400, color: i === q.correct_index ? "var(--ok)" : undefined }}>{LETTERS[i]}. {o}</span>)}</div>
            <div className="row between">
              <span className="muted small">נפתח: {fmtDateTime(q.unlock_at, tz)} אצלה · {fmtDateTime(q.unlock_at, myTz)} אצלך</span>
              {!q.answered_at && <button className="linkbtn" onClick={() => del(q)}>מחיקה</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewQuiz({ tz, defaultUnlock, done }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [unlock, setUnlock] = useState(defaultUnlock);
  const [expType, setExpType] = useState("video");
  const [file, setFile] = useState(null);
  const [audio, setAudio] = useState(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState(null);
  const [prog, setProg] = useState(0);
  const [err, setErr] = useState("");

  const filled = options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
  const expBlob = expType === "audio" ? audio : file;
  const valid = question.trim() && filled.length >= 2 && options[correct]?.trim() && (expType === "note" ? note.trim() : expBlob);

  const save = async () => {
    setErr("");
    try {
      let media = null;
      if (expType !== "note") {
        let up = expBlob;
        if (expType === "video" && up.size > 25 * 1024 * 1024) { setPhase("מכווץ…"); up = await compressVideo(up, setProg); }
        setPhase("מעלה…"); setProg(0);
        media = await uploadMedia(up, setProg);
      }
      setPhase("שומר…");
      const { data: exp, error: e1 } = await supabase.from("content_items").insert({
        kind: "quiz_explanation", media_type: expType, title: "הסבר: " + question.trim().slice(0, 60),
        body: note.trim() || null, media_path: media, notify: false,
      }).select().single();
      if (e1) throw e1;
      const compact = filled.map((x) => x.o);
      const newCorrect = filled.findIndex((x) => x.i === correct);
      const { error: e2 } = await supabase.from("quizzes").insert({
        question: question.trim(), options: compact, correct_index: newCorrect,
        explanation_item_id: exp.id, unlock_at: wallToDate(unlock, tz).toISOString(),
      });
      if (e2) throw e2;
      done();
    } catch (e) { setErr("לא נשמר: " + (e.message || "")); }
    setPhase(null);
  };

  return (
    <div className="card stack">
      <h3>חידה חדשה</h3>
      <input type="text" placeholder="השאלה" value={question} onChange={(e) => setQuestion(e.target.value)} />
      {options.map((o, i) => (
        <div key={i} className="row">
          <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} style={{ width: 22, height: 22, accentColor: "var(--ok)" }} />
          <input type="text" placeholder={`תשובה ${LETTERS[i]}${i > 1 ? " (לא חובה)" : ""}`} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
        </div>
      ))}
      <p className="muted small">הנקודה הירוקה מסמנת את התשובה הנכונה.</p>
      <label className="field">מתי נפתחת (שעה אצלה)
        <input type="datetime-local" value={unlock} onChange={(e) => setUnlock(e.target.value)} />
      </label>
      <div className="field">ההסבר שנפתח אחרי שהיא עונה</div>
      <div className="seg">
        <button className={expType === "video" ? "on" : ""} onClick={() => setExpType("video")}>🎬 סרטון</button>
        <button className={expType === "audio" ? "on" : ""} onClick={() => setExpType("audio")}>🎙️ הקלטה</button>
        <button className={expType === "note" ? "on" : ""} onClick={() => setExpType("note")}>💌 טקסט</button>
      </div>
      {expType === "video" && (
        <label className="btn ghost">{file ? `✓ ${file.name || "נבחר"}` : "🎬 לבחור / לצלם סרטון"}
          <input type="file" hidden accept="video/*" onChange={(e) => setFile(e.target.files[0])} />
        </label>
      )}
      {expType === "audio" && <AudioRecorder onDone={setAudio} maxSeconds={300} />}
      {expType === "note" && <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ההסבר…" />}
      {phase && <><span className="small">{phase}</span><Progress value={prog} /></>}
      {err && <p className="err">{err}</p>}
      <div className="row">
        <button className="btn" disabled={!valid || !!phase} onClick={save}>לשמור חידה</button>
        <button className="btn ghost" onClick={done}>ביטול</button>
      </div>
    </div>
  );
}
