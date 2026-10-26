import { authUser, bearer, json } from "../_auth.js";

const EXT = /^[a-z0-9]{1,5}$/;
const KEY = /^m\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

export async function onRequest({ request, env }) {
  const user = await authUser(env, bearer(request));
  if (!user) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const type = url.searchParams.get("type") || "application/octet-stream";

  if (action === "create" && request.method === "POST") {
    const ext = (url.searchParams.get("ext") || "bin").toLowerCase();
    if (!EXT.test(ext)) return json({ error: "bad ext" }, 400);
    const key = `m/${crypto.randomUUID()}.${ext}`;
    const mpu = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: type } });
    return json({ key, uploadId: mpu.uploadId });
  }

  const key = url.searchParams.get("key") || "";
  if (!KEY.test(key)) return json({ error: "bad key" }, 400);
  const uploadId = url.searchParams.get("uploadId");
  const mpu = env.MEDIA.resumeMultipartUpload(key, uploadId);

  if (action === "part" && request.method === "PUT") {
    const n = parseInt(url.searchParams.get("part"), 10);
    const part = await mpu.uploadPart(n, request.body);
    return json(part);
  }
  if (action === "complete" && request.method === "POST") {
    const { parts } = await request.json();
    await mpu.complete(parts);
    return json({ key });
  }
  if (action === "abort" && request.method === "POST") {
    await mpu.abort();
    return json({ ok: true });
  }
  return json({ error: "bad request" }, 400);
}
