import { json, isAdmin, sameOrigin, readJson, clientIp, rateLimit } from "../lib/shared.mjs";
import { CHUNK, initUpload, putChunk, finishUpload } from "../lib/video.mjs";

// อัปโหลดวิดีโอแบบแบ่งก้อน (แอดมินเท่านั้น)
//   POST {action:"init", name, size}  → {id, chunk, chunks}
//   PUT  ?vid=<id>&n=<ลำดับก้อน>  body = ไบต์ของก้อน (≤ 4 MB)
//   POST {action:"finish", vid}       → {video}
export default async (req, ctx) => {
  if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  if (!(await rateLimit("vid:" + clientIp(req, ctx), 600, 10 * 60 * 1000))) return json({ error: "อัปโหลดถี่เกินไป ลองใหม่ภายหลัง" }, 429);
  if (req.method === "PUT") {
    const u = new URL(req.url);
    const id = u.searchParams.get("vid") || "", n = Number(u.searchParams.get("n"));
    if (Number(req.headers.get("content-length") || 0) > CHUNK) return json({ error: "ก้อนใหญ่เกินไป" }, 413);
    let bytes; try { bytes = new Uint8Array(await req.arrayBuffer()); } catch { return json({ error: "bad_request" }, 400); }
    const r = await putChunk(id, n, bytes);
    return r.error ? json({ error: r.error }, r.status) : json(r);
  }
  if (req.method === "POST") {
    let b; try { b = await readJson(req, 2000); } catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
    if (b.action === "init") { const r = await initUpload(b.name, b.size); return r.error ? json({ error: r.error }, r.status) : json(r); }
    if (b.action === "finish") { const r = await finishUpload(String(b.vid || "")); return r.error ? json({ error: r.error }, r.status) : json(r); }
    return json({ error: "bad_action" }, 400);
  }
  return json({ error: "method" }, 405);
};
export const config = { path: "/api/admin-video" };
