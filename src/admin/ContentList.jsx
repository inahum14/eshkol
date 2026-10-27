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
            <EditItem item={sel} saved={(u) => { setSel({ ...sel, ...u }); load(); toast("נשמר ✓"); }} />
            <button className="btn danger small" onClick={() => del(sel)}>מחיקה</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function EditItem({ item, saved }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body || "");
  if (!open) return <button className="btn ghost small" onClick={() => setOpen(true)}>✏️ עריכת כותרת וטקסט</button>;
  const save = async () => {
    const u = { title: title.trim(), body: body.trim() || null };
    const { error } = await supabase.from("content_items").update(u).eq("id", item.id);
    if (!error) { setOpen(false); saved(u); }
  };
  return (
    <div className="card stack">
      <label className="field">כותרת<input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field">{item.media_type === "note" ? "הפתק" : "טקסט נלווה"}<textarea value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <div className="row"><button className="btn small" disabled={!title.trim()} onClick={save}>שמירה</button><button className="btn small ghost" onClick={() => setOpen(false)}>ביטול</button></div>
    </div>
  );
}
