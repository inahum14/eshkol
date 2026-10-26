import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { code, ido_password, ofri_password } = await req.json().catch(() => ({}));

  const { data: secret } = await db.from("app_secrets").select("value").eq("name", "setup_code").maybeSingle();
  if (!secret) return json({ error: "ההגדרה הראשונית כבר בוצעה" }, 400);
  if (String(code ?? "").trim() !== secret.value) return json({ error: "קוד הגדרה שגוי" }, 403);
  if (!ido_password || !ofri_password || ido_password.length < 6 || ofri_password.length < 6)
    return json({ error: "סיסמה צריכה להיות לפחות 6 תווים" }, 400);

  const { count } = await db.from("profiles").select("*", { count: "exact", head: true });
  if ((count ?? 0) > 0) return json({ error: "המשתמשים כבר קיימים" }, 400);

  const users = [
    { email: "ido@eshkol.app", password: ido_password, role: "admin", name: "עידו", tz: "Asia/Jerusalem" },
    { email: "ofri@eshkol.app", password: ofri_password, role: "partner", name: "עופרי", tz: "America/Argentina/Buenos_Aires" },
  ];
  for (const u of users) {
    const { data, error } = await db.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
    if (error) return json({ error: error.message }, 500);
    const { error: pe } = await db.from("profiles").insert({ id: data.user.id, role: u.role, display_name: u.name, timezone: u.tz });
    if (pe) return json({ error: pe.message }, 500);
  }
  await db.from("app_secrets").delete().eq("name", "setup_code");
  return json({ ok: true });
});
