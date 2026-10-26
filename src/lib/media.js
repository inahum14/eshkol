import { supabase } from "./supabase";

const CHUNK = 8 * 1024 * 1024;

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

export function extFor(blob, fallback = "bin") {
  const t = (blob.type || "").toLowerCase();
  if (blob.name && /\.[a-z0-9]{1,5}$/i.test(blob.name)) return blob.name.split(".").pop().toLowerCase();
  if (t.includes("mp4")) return t.startsWith("audio") ? "m4a" : "mp4";
  if (t.includes("webm")) return "webm";
  if (t.includes("quicktime")) return "mov";
  if (t.includes("jpeg")) return "jpg";
  if (t.includes("png")) return "png";
  if (t.includes("heic")) return "heic";
  if (t.includes("mpeg")) return "mp3";
  if (t.includes("ogg")) return "ogg";
  return fallback;
}

/** Upload a Blob to R2 via chunked multipart. Returns the storage key. */
export async function uploadMedia(blob, onProgress = () => {}) {
  const t = await token();
  const H = { Authorization: `Bearer ${t}` };
  const type = blob.type || "application/octet-stream";
  const c = await fetch(`/api/upload?action=create&ext=${extFor(blob)}&type=${encodeURIComponent(type)}`, { method: "POST", headers: H });
  if (!c.ok) throw new Error("ההעלאה נכשלה");
  const { key, uploadId } = await c.json();
  const q = `key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}`;
  const parts = [];
  const total = Math.max(1, Math.ceil(blob.size / CHUNK));
  try {
    for (let i = 0; i < total; i++) {
      const chunk = blob.slice(i * CHUNK, Math.min(blob.size, (i + 1) * CHUNK));
      let r, tries = 0;
      do {
        r = await fetch(`/api/upload?action=part&part=${i + 1}&${q}`, { method: "PUT", headers: H, body: chunk });
      } while (!r.ok && ++tries < 3);
      if (!r.ok) throw new Error("ההעלאה נכשלה");
      parts.push(await r.json());
      onProgress((i + 1) / total);
    }
    const done = await fetch(`/api/upload?action=complete&${q}`, {
      method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ parts }),
    });
    if (!done.ok) throw new Error("ההעלאה נכשלה");
  } catch (e) {
    fetch(`/api/upload?action=abort&${q}`, { method: "POST", headers: H });
    throw e;
  }
  return key;
}

let cachedToken = null;
supabase.auth.onAuthStateChange((_e, s) => { cachedToken = s?.access_token ?? null; });
supabase.auth.getSession().then(({ data }) => { cachedToken = data.session?.access_token ?? null; });

export function mediaUrl(key) {
  if (!key) return "";
  return `/api/media/${key}?t=${encodeURIComponent(cachedToken || "")}`;
}

function pickRecorderType(kind) {
  const opts = kind === "audio"
    ? ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
    : ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];
  return opts.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
}
export { pickRecorderType };

/**
 * Re-encode a video to ~720p at a modest bitrate, in real time, in the browser.
 * Falls back to the original file if anything is unsupported.
 */
export async function compressVideo(file, onProgress = () => {}) {
  const type = pickRecorderType("video");
  if (!type || !HTMLCanvasElement.prototype.captureStream) return file;
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url; video.playsInline = true; video.muted = false; video.preload = "auto";
    await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = rej; });
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round((video.videoWidth * scale) / 2) * 2;
    const h = Math.round((video.videoHeight * scale) / 2) * 2;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(30);

    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    const src = ac.createMediaElementSource(video);
    const dest = ac.createMediaStreamDestination();
    src.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_200_000, audioBitsPerSecond: 128_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((res) => (rec.onstop = res));

    let raf;
    const draw = () => {
      ctx.drawImage(video, 0, 0, w, h);
      onProgress(Math.min(0.99, video.currentTime / (video.duration || 1)));
      if (!video.ended) raf = requestAnimationFrame(draw);
    };
    await ac.resume();
    rec.start(1000);
    await video.play();
    draw();
    await new Promise((res) => (video.onended = res));
    cancelAnimationFrame(raf);
    rec.stop();
    await stopped;
    ac.close();
    const out = new Blob(chunks, { type: type.split(";")[0] });
    onProgress(1);
    if (!out.size || out.size > file.size) return file;
    return out;
  } catch (e) {
    console.warn("compress failed", e);
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Resize an image to max 1600px JPEG */
export async function compressImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
