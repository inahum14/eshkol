import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fmtDateTime } from "../lib/time";
import { MediaView, Sheet, MEDIA_ICON, useToast } from "../ui";
import { catOf } from "../partner/Envelopes";

const FILTERS = [
  { id: "all", label: "הכול" },
  { id: "envelope", label: "מעטפות" },
  { id: "scheduled", label: "מתוזמנים" },
  { id: "sent", label: "נשלחו" },
];
const KIND_LABEL = { envelope: "מעטפה", scheduled: "מתוזמן", live: "נשלח", request_answer: "תשובה לבקשה", quiz_explanation: "הסבר לחידה" };

export default function ContentList() {
  const [items, setItems] = useState(null);
  const [f, setF] = useState("all");
  const [sel, setSel] = useState(null);
  const toast = useToast();
  const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const load = async () => {
    const { data } = await supabase.from("content_items").select("*, content_views(opened_at), replies(id)")
      .neq("kind", "quiz_explanation").order("created_at", { ascending: false });
    setItems(data || []);
  };
  useEffect(() => { load(); }, []);
  if (!items) return null;

  const list = items.filter((i) => f === "all" || (f === "sent" ? ["live", "request_answer"].includes(i.kind) : i.kind === f));
  const envs = items.filter((i) => i.kind === "envelope");
  const opened = (i) => i.content_views?.[0]?.opened_at;

  const del = async (i) => {
    if (!confirm(`למחוק את "${i.title}"?`)) return;
    await supabase.from("content_items").delete().eq("id", i.id);
    setSel(null); toast("נמחק"); load();
  };

  return (
    <div className="stack">
      <div className="grid2">
        <div className="card"><div className="muted small">מעטפות במאגר</div><b style={{ fontSize: 22 }}>{envs.filter((e) => !opened(e)).length}</b> <span className="muted small">סגורות מתוך {envs.length}</span></div>
        <div className="card"><div className="muted small">מתוזמנים קדימה</div><b style={{ fontSize: 22 }}>{items.filter((i) => i.kind === "scheduled" && new Date(i.unlock_at) > new Date()).length}</b></div>
      </div>
      <div className="seg">{FILTERS.map((x) => <button key={x.id} className={f === x.id ? "on" : ""} onClick={() => setF(x.id)}>{x.label}</button>)}</div>
      <div className="list">
        {list.map((i) => {
          const future = i.unlock_at && new Date(i.unlock_at) > new Date();
          return (
            <div key={i.id} className={`item ${future ? "locked" : ""}`} onClick={() => setSel(i)}>
              <div className="ico">{MEDIA_ICON[i.media_type]}</div>
              <div className="grow">
                <div className="t">{i.title}</div>
                <div className="muted small">
                  {KIND_LABEL[i.kind]}{i.kind === "envelope" ? ` · ${catOf(i.envelope_category).label}` : ""}
                  {future ? ` · ייפתח ${fmtDateTime(i.unlock_at, myTz)} (שעון ישראל)` : ""}
                </div>
              </div>
              {opened(i) ? <span className="chip ok">נצפה</span> : !future && <span className="chip">לא נצפה</span>}
              {i.replies?.length > 0 && <span className="chip gold">💬</span>}
            </div>
          );
        })}
      </div>
      {!list.length && <div className="empty">אין כאן עדיין כלום</div>}

      {sel && (
        <Sheet onClose={() => setSel(null)}>
          <div className="stack">
            <h2>{sel.title}</h2>
            <div className="chips">
              <span className="chip">{KIND_LABEL[sel.kind]}</span>
              {opened(sel) ? <span className="chip ok">נצפה {fmtDateTime(opened(sel), myTz)}</span> : <span className="chip">לא נצפה</span>}
              {sel.pre_open_message && <span className="chip gold">"{sel.pre_open_message}"</span>}
              {sel.allow_reply && <span className="chip">תגובה: {sel.reply_types.map((t) => (t === "text" ? "טקסט" : "קול")).join(", ")}</span>}
            </div>
            <MediaView mediaType={sel.media_type} mediaPath={sel.media_path} body={sel.body} />
            <button className="btn danger small" onClick={() => del(sel)}>מחיקה</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
