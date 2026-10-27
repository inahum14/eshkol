import { useState } from "react";
import { rpc, supabase } from "../lib/supabase";
import { MediaView, Sheet, useToast, usePreview } from "../ui";
import { fmtDate, myTz } from "../lib/time";

const LETTERS = ["א", "ב", "ג", "ד"];
const SUSPENSE_MS = 3200;

export default function Quizzes({ quizzes, reload }) {
  const [active, setActive] = useState(null);
  const open = quizzes.filter((q) => !q.answered_at);
  const done = quizzes.filter((q) => q.answered_at);
  const correct = done.filter((q) => q.is_correct).length;

  return (
    <div className="stack">
      <div className="env-head"><h1>חידות</h1><p>כל תשובה נכונה = ענב 🍇</p></div>
      <div className="card soft center">
        <div>צדקת ב-<b>{correct}</b> מתוך <b>{done.length}</b> חידות</div>
      </div>

      {open.length === 0 && <div className="empty">אין חידה פתוחה כרגע. חידה חדשה מגיעה כל יומיים 🧩</div>}
      {open.map((q) => (
        <div key={q.id} className="card hero clickable hero-center" onClick={() => setActive(q)}>
          <div className="hero-ic">🧩</div>
          <h2>חידה יומית חדשה</h2>
          <span className="chip gold">תשובה נכונה = ענב 🍇</span>
          <button className="btn gold">לענות</button>
        </div>
      ))}

      {done.length > 0 && <h3>חידות קודמות</h3>}
      <div className="list">
        {done.map((q) => (
          <div key={q.id} className="item" onClick={() => setActive(q)}>
            <div className="ico">{q.is_correct ? "✅" : "❌"}</div>
            <div className="grow"><div className="t">{q.question}</div><div className="muted small">{fmtDate(q.answered_at, myTz())}</div></div>
          </div>
        ))}
      </div>

      {active && <QuizPlay quiz={active} onClose={() => { setActive(null); reload(); }} />}
    </div>
  );
}

function QuizPlay({ quiz, onClose }) {
  const answered = !!quiz.answered_at;
  const [picked, setPicked] = useState(answered ? quiz.chosen_index : null);
  const [result, setResult] = useState(answered ? { correct: quiz.is_correct, correct_index: quiz.correct_index, explanation_item_id: quiz.explanation_item_id } : null);
  const [revealed, setRevealed] = useState(answered);
  const [explain, setExplain] = useState(null);
  const toast = useToast();
  const preview = usePreview();

  const choose = async (i) => {
    if (picked !== null) return;
    setPicked(i);
    const started = Date.now();
    try {
      const r = preview
        ? await supabase.from("quizzes").select("correct_index, explanation_item_id").eq("id", quiz.id).single()
            .then(({ data }) => ({ correct: data.correct_index === i, correct_index: data.correct_index, explanation_item_id: data.explanation_item_id }))
        : await rpc("answer_quiz", { p_quiz: quiz.id, p_choice: i });
      setResult(r);
      const wait = Math.max(0, SUSPENSE_MS - (Date.now() - started));
      setTimeout(() => {
        setRevealed(true);
        if (r.correct) toast(preview ? "נכון! (במצב תצוגה לא נשמר)" : "נכון!! קיבלת ענב 🍇");
      }, wait);
    } catch {
      setPicked(null);
      toast("משהו השתבש, נסי שוב");
    }
  };

  const cls = (i) => {
    if (!revealed) return i === picked ? "picked" : "";
    if (i === result.correct_index) return "right";
    if (i === picked) return "wrong";
    return "";
  };

  const loadExplain = async () => {
    const rows = preview
      ? await supabase.from("content_items").select("*").eq("id", result.explanation_item_id).then((r) => r.data)
      : await rpc("get_explanation", { p_quiz: quiz.id });
    setExplain(rows?.[0] || { body: "אין הסבר הפעם 💜" });
  };

  return (
    <Sheet onClose={onClose}>
      <div className="stack">
        <span className="chip gold">🧩 חידה</span>
        <h2>{quiz.question}</h2>
        <div>
          {quiz.options.map((o, i) => (
            <button key={i} className={`quiz-opt ${cls(i)}`} onClick={() => choose(i)} disabled={picked !== null && !revealed}>
              <span className="letter">{LETTERS[i]}</span>{o}
            </button>
          ))}
        </div>
        {picked !== null && !revealed && <p className="center muted">רגע של מתח… 🥁</p>}
        {revealed && (
          <div className="stack">
            <div className={`card center ${result.correct ? "" : "soft"}`}>
              <h3>{result.correct ? "צדקת! 🎉" : "לא הפעם 💜"}</h3>
              <p className="small">{result.correct ? "ענב בונוס נוסף לך" : result.explanation_item_id ? "אבל יש לי הסבר בשבילך" : "בפעם הבאה 💜"}</p>
            </div>
            {!explain && result.explanation_item_id && <button className="btn block" onClick={loadExplain}>להסבר ⬇️</button>}
            {explain && <MediaView mediaType={explain.media_type} mediaPath={explain.media_path} body={explain.body} autoPlay />}
          </div>
        )}
        <button className="btn ghost block" onClick={onClose}>סגירה</button>
      </div>
    </Sheet>
  );
}
