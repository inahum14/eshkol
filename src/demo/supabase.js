// Demo-only stand-in for Supabase: in-memory data so the UI can be previewed without a server.
export const SUPABASE_URL = "";
export const SUPABASE_KEY = "";
export const VAPID_PUBLIC = "";
export const usernameToEmail = (u) => u;

const now = Date.now();
const iso = (ms) => new Date(now + ms).toISOString();
const H = 3600e3;

const db = {
  profiles: [
    { id: "a1", role: "admin", display_name: "עידו", timezone: "Asia/Jerusalem" },
    { id: "p1", role: "partner", display_name: "עופרי", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, last_active_at: iso(-5 * 60e3), created_at: iso(-30 * 24 * H) },
  ],
  settings: [{ id: 1, daily_grapes: 1, grape_ttl_hours: 72, quiet_start: "23:00:00", quiet_end: "08:00:00", active_override_minutes: 15, return_clock_enabled: true, return_date: null, weekly_video_open_dow: 5, weekly_video_grace_dow: 6 }],
  content_items: [
    { id: "i1", kind: "live", media_type: "note", title: "בוקר טוב מאורנית", body: "בוקר טוב יפה שלי ☀️\nהתעוררתי וחשבתי עלייך.\nתהני מהיום, ותספרי לי הכול בערב 💜", allow_reply: true, reply_types: ["text", "audio"], pre_open_message: null, created_at: iso(-2 * H) },
    { id: "i2", kind: "scheduled", media_type: "note", title: "שבוע ראשון בבואנוס איירס!", body: "עבר שבוע. אני כל כך גאה בך.", allow_reply: false, reply_types: [], unlock_at: iso(-20 * H), created_at: iso(-3 * 24 * H) },
    { id: "e1", kind: "envelope", media_type: "note", title: "שיר שלנו", envelope_category: "miss", body: "את זוכרת את הנסיעה לצפון? השיר הזה התנגן כל הדרך 🎶", reply_types: [] },
    { id: "e2", kind: "envelope", media_type: "note", title: "כשאת לא נרדמת", envelope_category: "sleep", body: "תנשמי עמוק. אני פה. 🌙", reply_types: [] },
    { id: "e3", kind: "envelope", media_type: "note", title: "תזכורת קטנה", envelope_category: "hard", body: "את חזקה ממה שאת חושבת. באמת.", pre_open_message: "חפשי מקום שקט", reply_types: [] },
    { id: "e4", kind: "envelope", media_type: "note", title: "בדיחה פרטית", envelope_category: "laugh", body: "רק אומר: הסיפור עם הפינגווין 🐧", reply_types: [] },
    { id: "e5", kind: "envelope", media_type: "note", title: "קרה משהו מדהים?", envelope_category: "amazing", body: "ספרי לי הכול!! ✨", reply_types: [] },
  ],
  content_views: [{ item_id: "i2", opened_at: iso(-19 * H) }, { item_id: "e2", opened_at: iso(-40 * H) }],
  grapes: [
    { id: "g1", source: "daily", expires_at: iso(50 * H), granted_at: iso(-22 * H) },
    { id: "g2", source: "quiz", expires_at: iso(66 * H), granted_at: iso(-6 * H) },
  ],
  quizzes: [
    { id: "q1", question: "איפה נפגשנו בפעם הראשונה?", options: ["בים", "במסיבה", "בעבודה", "אצל חברים"], correct_index: 3, unlock_at: iso(-3 * H) },
    { id: "q0", question: "מה הזמנו בדייט הראשון?", options: ["פיצה", "סושי", "המבורגר"], correct_index: 1, unlock_at: iso(-50 * H), answered_at: iso(-48 * H), chosen_index: 1, is_correct: true },
  ],
  destinations: [
    { id: "d1", name: "בואנוס איירס", country: "ארגנטינה", lat: -34.6, lng: -58.38, arrived_at: iso(-7 * 24 * H) },
    { id: "d2", name: "מנדוסה", country: "ארגנטינה", lat: -32.89, lng: -68.84, arrived_at: iso(-2 * 24 * H) },
  ],
  experiences: [
    { id: "x1", destination_id: "d1", title: "טנגו בסן טלמו", note: "רקדתי! בערך 😅", status: "done", done_at: iso(-6 * 24 * H), created_at: iso(-6 * 24 * H) },
    { id: "x2", destination_id: "d1", title: "קמיניטו", status: "wish", created_at: iso(-6 * 24 * H) },
    { id: "x3", destination_id: "d2", title: "סיור יקבים באופניים", status: "wish", created_at: iso(-1 * 24 * H) },
  ],
  emergency_contacts: [
    { id: 1, country: 'ישראלים בחו"ל', country_order: 0, label: "חדר המצב של משרד החוץ (24/7)", value: "+97225303155", kind: "phone", item_order: 1 },
    { id: 2, country: "ארגנטינה", country_order: 1, label: "חירום כללי", value: "911", kind: "phone", item_order: 1 },
    { id: 3, country: "ארגנטינה", country_order: 1, label: "משטרה", value: "101", kind: "phone", item_order: 2 },
    { id: 4, country: "ברזיל", country_order: 2, label: "משטרה", value: "190", kind: "phone", item_order: 1 },
    { id: 5, country: "פרו", country_order: 3, label: "משטרה", value: "105", kind: "phone", item_order: 1 },
  ],
  content_requests: [], grape_requests: [], vent_messages: [], weekly_videos: [], replies: [], push_subscriptions: [],
};

let uid = 100;
const opened = (id) => db.content_views.find((v) => v.item_id === id)?.opened_at || null;

const rpcs = {
  check_in: () => ({ ok: true }),
  partner_feed: () => db.content_items
    .filter((i) => i.kind !== "quiz_explanation" && (!i.unlock_at || new Date(i.unlock_at) <= new Date()))
    .map((i) => {
      const o = opened(i.id);
      return { ...i, opened_at: o, body: o ? i.body : null, media_path: null, my_reply_count: db.replies.filter((r) => r.item_id === i.id).length };
    }),
  available_grapes: () => db.grapes.filter((g) => !g.used_at && new Date(g.expires_at) > new Date()).sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at)),
  streak_info: () => ({ streak: 6, today_done: db.content_views.some((v) => new Date(v.opened_at) > new Date(now - 12 * H)) }),
  partner_quizzes: () => db.quizzes.map((q) => ({ ...q, correct_index: q.answered_at ? q.correct_index : null, explanation_item_id: q.answered_at ? "x" : null })),
  weekly_video_window: () => ({ open: true, sent_this_week: false }),
  open_item: ({ p_item }) => {
    const it = db.content_items.find((i) => i.id === p_item);
    if (opened(p_item)) return { ok: true, already: true };
    if (it.kind === "envelope") {
      const g = rpcs.available_grapes()[0];
      if (!g) return { ok: false, reason: "no_grapes" };
      g.used_at = new Date().toISOString();
    }
    db.content_views.push({ item_id: p_item, opened_at: new Date().toISOString() });
    return { ok: true };
  },
  answer_quiz: ({ p_quiz, p_choice }) => {
    const q = db.quizzes.find((x) => x.id === p_quiz);
    q.answered_at = new Date().toISOString(); q.chosen_index = p_choice; q.is_correct = p_choice === q.correct_index;
    if (q.is_correct) db.grapes.push({ id: "g" + uid++, source: "quiz", expires_at: iso(72 * H) });
    return { correct: q.is_correct, correct_index: q.correct_index, explanation_item_id: "x" };
  },
  get_explanation: () => [{ media_type: "note", body: "אצל חברים, אצל נועה! ישבת בפינה עם כוס יין ואני לא הפסקתי לחפש סיבה לדבר איתך 😄" }],
  send_reply: ({ p_item, p_type, p_text }) => { db.replies.push({ id: uid++, item_id: p_item, reply_type: p_type, text_body: p_text }); return uid; },
  set_return_date: ({ p_date }) => { db.settings[0].return_date = p_date; },
  submit_weekly_video: () => ({ ok: true }),
};

class Q {
  constructor(t) { this.t = t; this.filters = []; this.op = "select"; this.payload = null; this._one = false; }
  select() { return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  neq(k, v) { this.filters.push((r) => r[k] !== v); return this; }
  is() { return this; } lte() { return this; } in() { return this; }
  order() { return this; } limit() { return this; }
  insert(p) { this.op = "insert"; this.payload = p; return this; }
  update(p) { this.op = "update"; this.payload = p; return this; }
  upsert(p) { this.op = "insert"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  maybeSingle() { this._one = true; return this; }
  single() { this._one = true; return this; }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
  run() {
    const rows = db[this.t] || (db[this.t] = []);
    if (this.op === "insert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p) => ({ id: "n" + uid++, created_at: new Date().toISOString(), status: "pending", experiences: [], ...p }));
      rows.push(...items);
      return { data: this._one ? items[0] : items, error: null };
    }
    const hit = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") { hit.forEach((r) => Object.assign(r, this.payload)); return { data: hit, error: null }; }
    if (this.op === "delete") { db[this.t] = rows.filter((r) => !hit.includes(r)); return { data: null, error: null }; }
    let data = hit;
    if (this.t === "destinations") data = hit.map((d) => ({ ...d, experiences: db.experiences.filter((e) => e.destination_id === d.id) }));
    return { data: this._one ? data[0] ?? null : data, error: null };
  }
}

const session = { access_token: "demo", user: { id: "p1" } };
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session } }),
    getUser: async () => ({ data: { user: session.user } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => {},
    signInWithPassword: async () => ({}),
  },
  from: (t) => new Q(t),
  rpc: async (name, args) => ({ data: rpcs[name] ? rpcs[name](args || {}) : null, error: null }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => {},
};

export async function rpc(name, args) {
  const { data } = await supabase.rpc(name, args);
  return data;
}
