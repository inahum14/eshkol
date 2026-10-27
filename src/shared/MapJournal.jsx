import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { supabase } from "../lib/supabase";
import { uploadMedia, compressImage, mediaUrl } from "../lib/media";
import { Sheet, useToast } from "../ui";
import { fmtDate, myTz } from "../lib/time";

const HEART_PIN = `<svg width="38" height="44" viewBox="0 0 30 34"><path d="M15 33C15 33 2 20.5 2 12.5C2 5.6 7.8 1 15 1s13 4.6 13 11.5C28 20.5 15 33 15 33Z" fill="#F0C96A" stroke="#fff" stroke-width="1.6"/><path d="M15 18.6c-.3 0-4.6-2.8-4.6-5.6 0-1.5 1.1-2.6 2.5-2.6.9 0 1.6.5 2.1 1.2.5-.7 1.2-1.2 2.1-1.2 1.4 0 2.5 1.1 2.5 2.6 0 2.8-4.3 5.6-4.6 5.6Z" fill="#3E1157"/></svg>`;
const pin = (n, active) => active
  ? L.divIcon({ className: "pin-now", html: HEART_PIN, iconSize: [38, 44], iconAnchor: [19, 43] })
  : L.divIcon({
      className: "",
      html: `<div style="width:26px;height:26px;border-radius:50%;background:#4A1468;color:#F0C96A;display:grid;place-items:center;font:13px 'Secular One',sans-serif;border:2px solid #F0C96A;box-shadow:0 2px 6px rgba(0,0,0,.3)">${n}</div>`,
      iconSize: [26, 26], iconAnchor: [13, 13],
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
      L.polyline(pts.map((d) => [d.lat, d.lng]), { color: "#C9922B", weight: 3, dashArray: "2 9", lineCap: "round" }).addTo(layer.current);
    }
    pts.forEach((d, i) => {
      L.marker([d.lat, d.lng], { icon: pin(i + 1, i === pts.length - 1) }).on("click", () => setSel(d)).addTo(layer.current);
    });
    if (pts.length) map.current.fitBounds(pts.map((d) => [d.lat, d.lng]), { padding: [50, 50], maxZoom: 7 });
  }, [dests]);

  const countries = new Set(dests.map((d) => d.country).filter(Boolean)).size;
  const doneCount = dests.reduce((n, d) => n + d.experiences.filter((e) => e.status === "done").length, 0);
  const ordered = [...dests].reverse();

  return (
    <div className="stack map-page">
      {canEdit && (
        <div className="env-head">
          <h1>המסלול שלי</h1>
          <p>{dests.length ? `${countries} מדינות · ${dests.length} יעדים · ${doneCount} חוויות` : "כאן יתמלא כל הטיול שלך"}</p>
        </div>
      )}
      {!canEdit && dests.length > 0 && <p className="map-stats">{countries} מדינות · {dests.length} יעדים · {doneCount} חוויות</p>}
      <div ref={mapEl} className="map" />
      {canEdit && <button className="btn gold block big-cta" onClick={() => setAdding(true)}>📍 הגעתי ליעד חדש</button>}

      {ordered.length > 0 && (
        <div className="timeline">
          {ordered.map((d, i) => {
            const done = d.experiences.filter((e) => e.status === "done").length;
            const wish = d.experiences.filter((e) => e.status === "wish").length;
            return (
              <button key={d.id} className={`tl-item ${i === 0 ? "now" : ""}`} onClick={() => setSel(d)}>
                <span className="tl-dot">{i === 0 ? "♥" : ordered.length - i}</span>
                <div className="tl-card">
                  <div className="row between">
                    <b>{d.name}</b>
                    {i === 0 && <span className="chip gold">{canEdit ? "את כאן עכשיו" : "היא כאן עכשיו"}</span>}
                  </div>
                  <div className="muted small">{d.country ? `${d.country} · ` : ""}{fmtDate(d.arrived_at, myTz())}</div>
                  <div className="tl-meta">✨ {done} חוויות{wish ? ` · ☐ ${wish} ברשימה` : ""}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {!dests.length && (
        <div className="card center stack">
          <div style={{ fontSize: 40 }}>🗺️</div>
          <b>{canEdit ? "המפה מחכה ליעד הראשון שלך" : "עוד אין יעדים"}</b>
          {canEdit && <p className="muted small" style={{ margin: 0 }}>כשתגיעי לעיר חדשה, לחצי על "הגעתי ליעד חדש". המיקום נקבע לבד.</p>}
        </div>
      )}
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
        <div className="center">
          <div style={{ fontSize: 34 }}>📍</div>
          <h2 style={{ margin: 0 }}>{dest.name}</h2>
          <div className="muted small">{dest.country ? `${dest.country} · ` : ""}{canEdit ? "הגעתי" : "הגיעה"} ב-{fmtDate(dest.arrived_at, myTz())}</div>
        </div>
        <div className="seg">
          <button className={tab === "done" ? "on" : ""} onClick={() => setTab("done")}>מה חוויתי</button>
          <button className={tab === "wish" ? "on" : ""} onClick={() => setTab("wish")}>רוצה לעשות כאן</button>
        </div>
        {canEdit && !adding && <button className="btn soft" onClick={() => setAdding(true)}>＋ {tab === "done" ? "הוספת חוויה" : "הוספה לרשימה"}</button>}
        {adding && <AddExperience destId={dest.id} status={tab} onDone={() => { setAdding(false); load(); }} />}
        <div className="list">
          {list.map((e) => (
            e.status === "wish" ? (
              <div key={e.id} className="wish-row">
                <button className="wish-check" disabled={!canEdit} onClick={() => markDone(e)} aria-label="עשיתי" />
                <span>{e.title}</span>
              </div>
            ) : (
              <div key={e.id} className="exp-card">
                {e.photo_path && <img src={mediaUrl(e.photo_path)} alt="" />}
                <div className="exp-body">
                  <b>✨ {e.title}</b>
                  {e.note && <p>{e.note}</p>}
                  {e.done_at && <span className="muted small">{fmtDate(e.done_at, myTz())}</span>}
                </div>
              </div>
            )
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
