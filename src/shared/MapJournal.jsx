import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { supabase } from "../lib/supabase";
import { uploadMedia, compressImage, mediaUrl } from "../lib/media";
import { Sheet, useToast } from "../ui";
import { fmtDate, myTz } from "../lib/time";

const pin = (n, active) => L.divIcon({
  className: "",
  html: `<div style="width:30px;height:30px;border-radius:50%;background:${active ? "#C9A24A" : "#4B2A6B"};color:#F7F1E8;display:grid;place-items:center;font:700 13px Heebo,sans-serif;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25)">${n}</div>`,
  iconSize: [30, 30], iconAnchor: [15, 15],
});

async function nominatim(path) {
  const r = await fetch(`https://nominatim.openstreetmap.org/${path}&format=jsonv2&accept-language=he`);
  return r.json();
}

export default function MapJournal({ canEdit }) {
  const [dests, setDests] = useState([]);
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const mapEl = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  const load = async () => {
    const { data } = await supabase.from("destinations").select("*, experiences(id,status)").order("arrived_at");
    setDests(data || []);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (map.current) return;
    map.current = L.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView([-23, -60], 3);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 18, subdomains: "abcd",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    const pts = dests.filter((d) => d.lat != null);
    if (pts.length > 1) {
      L.polyline(pts.map((d) => [d.lat, d.lng]), { color: "#7A4FA0", weight: 3, dashArray: "6 8" }).addTo(layer.current);
    }
    pts.forEach((d, i) => {
      L.marker([d.lat, d.lng], { icon: pin(i + 1, i === pts.length - 1) }).on("click", () => setSel(d)).addTo(layer.current);
    });
    if (pts.length) map.current.fitBounds(pts.map((d) => [d.lat, d.lng]), { padding: [40, 40], maxZoom: 8 });
  }, [dests]);

  return (
    <div className="stack">
      <div className="topbar"><div className="title">המסלול</div></div>
      <div ref={mapEl} className="map" />
      {canEdit && <button className="btn gold block" onClick={() => setAdding(true)}>📍 הגעתי ליעד חדש</button>}
      <div className="list">
        {[...dests].reverse().map((d) => (
          <div key={d.id} className="item" onClick={() => setSel(d)}>
            <div className="ico">📍</div>
            <div className="grow">
              <div className="t">{d.name}</div>
              <div className="muted small">{fmtDate(d.arrived_at, myTz())} · {d.experiences.filter((e) => e.status === "done").length} חוויות</div>
            </div>
          </div>
        ))}
      </div>
      {!dests.length && <div className="empty">{canEdit ? "כשתגיעי ליעד הראשון, לחצי על הכפתור 💜" : "עוד אין יעדים"}</div>}
      {adding && <AddDestination onClose={() => setAdding(false)} onAdded={(d) => { setAdding(false); load(); setSel(d); }} />}
      {sel && <DestinationSheet dest={sel} canEdit={canEdit} onClose={() => { setSel(null); load(); }} />}
    </div>
  );
}

function AddDestination({ onClose, onAdded }) {
  const [state, setState] = useState("locating");
  const [cand, setCand] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const toast = useToast();

  useEffect(() => {
    if (!navigator.geolocation) { setState("manual"); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude: lat, longitude: lng } = pos.coords;
        const r = await nominatim(`reverse?lat=${lat}&lon=${lng}&zoom=10`);
        const a = r.address || {};
        const name = a.city || a.town || a.village || a.county || a.state || r.name || "מקום חדש";
        setCand({ name, country: a.country, lat, lng });
        setState("confirm");
      } catch { setState("manual"); }
    }, () => setState("manual"), { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  }, []);

  const search = async () => {
    if (!q.trim()) return;
    try { setResults(await nominatim(`search?q=${encodeURIComponent(q)}&limit=5`)); } catch { setResults([]); }
  };

  const save = async (c) => {
    const { data, error } = await supabase.from("destinations").insert({ name: c.name, country: c.country, lat: c.lat, lng: c.lng }).select().single();
    if (error) return toast("לא נשמר");
    toast("יעד חדש על המפה 📍");
    onAdded({ ...data, experiences: [] });
  };

  return (
    <Sheet onClose={onClose}>
      <div className="stack">
        <h2>📍 יעד חדש</h2>
        {state === "locating" && <p className="muted">מאתרת איפה את…</p>}
        {state === "confirm" && cand && (
          <div className="stack">
            <div className="card soft center"><h2 style={{ margin: 0 }}>{cand.name}</h2><div className="muted">{cand.country}</div></div>
            <button className="btn" onClick={() => save(cand)}>כן, אני כאן</button>
            <button className="linkbtn" onClick={() => setState("manual")}>לא, אכתוב בעצמי</button>
          </div>
        )}
        {state === "manual" && (
          <div className="stack">
            <div className="row">
              <input type="text" placeholder="שם העיר / המקום" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
              <button className="btn small" onClick={search}>חיפוש</button>
            </div>
            <div className="list">
              {results.map((r) => (
                <div key={r.place_id} className="item" onClick={() => save({ name: r.name || r.display_name.split(",")[0], country: r.display_name.split(",").at(-1)?.trim(), lat: +r.lat, lng: +r.lon })}>
                  <div className="grow"><div className="t">{r.name || r.display_name.split(",")[0]}</div><div className="muted small">{r.display_name}</div></div>
                </div>
              ))}
            </div>
            {q.trim() && (
              <button className="linkbtn" onClick={() => save({ name: q.trim(), country: null, lat: null, lng: null })}>לשמור בלי מיקום על המפה</button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function DestinationSheet({ dest, canEdit, onClose }) {
  const [exps, setExps] = useState([]);
  const [tab, setTab] = useState("done");
  const [adding, setAdding] = useState(false);
  const load = async () => {
    const { data } = await supabase.from("experiences").select("*").eq("destination_id", dest.id).order("created_at", { ascending: false });
    setExps(data || []);
  };
  useEffect(() => { load(); }, []);

  const markDone = async (e) => {
    await supabase.from("experiences").update({ status: "done", done_at: new Date().toISOString() }).eq("id", e.id);
    load();
  };
  const list = exps.filter((e) => e.status === tab);

  return (
    <Sheet onClose={onClose}>
      <div className="stack">
        <h2>📍 {dest.name}</h2>
        <div className="muted small">{dest.country} · הגעתי ב-{fmtDate(dest.arrived_at, myTz())}</div>
        <div className="seg">
          <button className={tab === "done" ? "on" : ""} onClick={() => setTab("done")}>מה חוויתי</button>
          <button className={tab === "wish" ? "on" : ""} onClick={() => setTab("wish")}>רוצה לעשות כאן</button>
        </div>
        {canEdit && !adding && <button className="btn soft" onClick={() => setAdding(true)}>＋ {tab === "done" ? "הוספת חוויה" : "הוספה לרשימה"}</button>}
        {adding && <AddExperience destId={dest.id} status={tab} onDone={() => { setAdding(false); load(); }} />}
        <div className="list">
          {list.map((e) => (
            <div key={e.id} className="card stack" style={{ padding: 12 }}>
              <div className="row between">
                <b>{e.status === "wish" ? "☐ " : ""}{e.title}</b>
                {canEdit && e.status === "wish" && <button className="btn small soft" onClick={() => markDone(e)}>✓ עשיתי</button>}
              </div>
              {e.note && <p className="small" style={{ margin: 0 }}>{e.note}</p>}
              {e.photo_path && <img src={mediaUrl(e.photo_path)} alt="" style={{ borderRadius: 12 }} />}
              {e.done_at && e.status === "done" && <span className="muted small">{fmtDate(e.done_at, myTz())}</span>}
            </div>
          ))}
        </div>
        {!list.length && !adding && <div className="empty">{tab === "done" ? "עוד אין חוויות כאן" : "הרשימה ריקה"}</div>}
      </div>
    </Sheet>
  );
}

function AddExperience({ destId, status, onDone }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async () => {
    setBusy(true);
    try {
      let photo = null;
      if (file) photo = await uploadMedia(await compressImage(file));
      const { error } = await supabase.from("experiences").insert({
        destination_id: destId, title: title.trim(), note: note.trim() || null, photo_path: photo, status,
        done_at: status === "done" ? new Date().toISOString() : null,
      });
      if (error) throw error;
      onDone();
    } catch { toast("לא נשמר"); }
    setBusy(false);
  };
  return (
    <div className="card stack">
      <input type="text" placeholder={status === "done" ? "מה עשיתי?" : "מה רוצה לעשות?"} value={title} onChange={(e) => setTitle(e.target.value)} />
      {status === "done" && (
        <>
          <input type="text" placeholder="משפט קטן (לא חובה)" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="btn ghost small" style={{ alignSelf: "flex-start" }}>
            📷 {file ? "התמונה נבחרה ✓" : "להוסיף תמונה"}
            <input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files[0])} />
          </label>
        </>
      )}
      <button className="btn" disabled={busy || !title.trim()} onClick={save}>{busy ? "שומרת…" : "לשמור"}</button>
    </div>
  );
}
