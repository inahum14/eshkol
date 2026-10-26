import { authUser, json } from "../../_auth.js";

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const user = await authUser(env, url.searchParams.get("t"));
  if (!user) return json({ error: "unauthorized" }, 401);
  const key = (params.path || []).join("/");
  if (!/^m\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/.test(key)) return json({ error: "bad key" }, 400);

  const obj = await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response("not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=86400");
  if (!("body" in obj)) return new Response(null, { status: 304, headers });
  let status = 200;
  if (obj.range) {
    const r = obj.range;
    const off = "suffix" in r ? obj.size - r.suffix : (r.offset ?? 0);
    const len = "suffix" in r ? r.suffix : (r.length ?? obj.size - off);
    headers.set("content-range", `bytes ${off}-${off + len - 1}/${obj.size}`);
    headers.set("content-length", String(len));
    status = 206;
  } else {
    headers.set("content-length", String(obj.size));
  }
  return new Response(obj.body, { status, headers });
}
