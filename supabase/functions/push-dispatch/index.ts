import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const DEFAULTS: Record<string, string[]> = {
  streak: ["האשכול שלך מחכה לך 🍇", "לא שכחת אותי, נכון? 💜", "ענב קטן ביום שומר על הרצף 🔥"],
  weekly_video: ["הגיע יום שישי, מחכה לסרטון ממך 💜"],
  weekly_video_grace: ["עוד אפשר לשלוח את הסרטון השבועי, עד סוף היום 🎥"],
};

function localParts(tz: string, d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    weekday: "short", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)!.value;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: +g("hour"), minute: +g("minute"), dow };
}

// UTC instant of a wall-clock time in tz
function zonedToUtc(dateStr: string, hhmm: string, tz: string) {
  const guess = new Date(`${dateStr}T${hhmm}:00Z`);
  const p = localParts(tz, guess);
  const asUtc = Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, +p.date.slice(8, 10), p.hour, p.minute);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}
function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: secrets } = await db.from("app_secrets").select("name,value");
  const S = Object.fromEntries((secrets ?? []).map((r) => [r.name, r.value]));
  if (req.headers.get("x-cron-secret") !== S.cron_secret) return new Response("forbidden", { status: 403 });

  webpush.setVapidDetails("mailto:eshkol@example.com", S.vapid_public, S.vapid_private);

  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  const { data: profiles } = await db.from("profiles").select("*");
  const partner = profiles?.find((p) => p.role === "partner");
  const log: string[] = [];
  await db.rpc("grant_due_bonus");

  // ---- scheduled reminders for her ----
  if (partner) {
    const L = localParts(partner.timezone);
    const enqueueOnce = async (kind: string, title: string) => {
      const { error } = await db.from("reminder_log").insert({ kind, local_date: L.date });
      if (error) return; // already sent today
      const { data: tpl } = await db.from("reminder_templates").select("text_body").eq("kind", kind.replace("_grace", ""));
      const pool = tpl?.length ? tpl.map((t) => t.text_body) : DEFAULTS[kind];
      const body = pool[Math.floor(Math.random() * pool.length)];
      await db.from("notification_queue").insert({ target_user: partner.id, title, body, url: "/" });
      log.push("reminder " + kind);
    };
    // streak: evening reminder if nothing viewed today
    if (L.hour >= 19 && L.hour < 22) {
      const { data: today } = await db.from("daily_activity").select("viewed_content").eq("local_date", L.date).maybeSingle();
      if (!today?.viewed_content) await enqueueOnce("streak", "אני כאן 💜");
    }
    // weekly video window
    const { data: win } = await db.rpc("weekly_video_window");
    if (win?.open) {
      if (L.dow === settings.weekly_video_open_dow && L.hour >= 9) await enqueueOnce("weekly_video", "הסרטון השבועי 🎥");
      if (L.dow === settings.weekly_video_grace_dow && L.hour >= 11) await enqueueOnce("weekly_video_grace", "הסרטון השבועי 🎥");
    }
  }

  // ---- deliver queue ----
  const { data: due } = await db.from("notification_queue").select("*")
    .is("sent_at", null).lte("send_after", new Date().toISOString()).order("created_at").limit(50);

  for (const n of due ?? []) {
    const target = profiles?.find((p) => p.id === n.target_user);
    if (!target) continue;
    if (target.role === "partner" && n.respect_quiet_hours && !n.urgent) {
      const L = localParts(target.timezone);
      const m = L.hour * 60 + L.minute;
      const qs = toMin(settings.quiet_start), qe = toMin(settings.quiet_end);
      const inQuiet = qs > qe ? (m >= qs || m < qe) : (m >= qs && m < qe);
      const activeRecently = target.last_active_at &&
        Date.now() - new Date(target.last_active_at).getTime() < settings.active_override_minutes * 60000;
      if (inQuiet && !activeRecently) {
        const wakeDate = m >= qs && qs > qe ? addDays(L.date, 1) : L.date;
        const wake = zonedToUtc(wakeDate, settings.quiet_end.slice(0, 5), target.timezone);
        await db.from("notification_queue").update({ send_after: wake.toISOString() }).eq("id", n.id);
        log.push("deferred " + n.id);
        continue;
      }
    }
    const { data: subs } = await db.from("push_subscriptions").select("*").eq("user_id", n.target_user);
    const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url ?? "/", urgent: n.urgent, tag: n.urgent ? "urgent-" + n.id : undefined });
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
          { TTL: 60 * 60 * 24, urgency: n.urgent ? "high" : "normal" });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        log.push("push error " + code);
      }
    }
    await db.from("notification_queue").update({ sent_at: new Date().toISOString() }).eq("id", n.id);
    log.push("sent " + n.id);
  }
  return new Response(JSON.stringify({ ok: true, log }), { headers: { "Content-Type": "application/json" } });
});
