import { isAdmin } from "../lib/shared.mjs";
import { getEvents } from "../lib/events.mjs";
import { CHUNK, VID_RE, readChunk, getMeta } from "../lib/video.mjs";

// ส่งวิดีโอให้ผู้ชมตาม Range  GET /api/video/<id>
// ส่งได้ก็ต่อเมื่อถึงเวลาประกาศแล้วเท่านั้น (ก่อนหน้านั้นตอบ 404, แอดมินดูตัวอย่างได้)
export default async (req) => {
  const nf = () => new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method", { status: 405 });
  const m = new URL(req.url).pathname.match(/^\/api\/video\/([a-f0-9]{16})$/);
  if (!m || !VID_RE.test(m[1])) return nf();
  const id = m[1], now = Date.now(), admin = isAdmin(req);
  const e = await getEvents();
  let v = null, open = false, leek = false;
  for (const a of e.announcements || []) if (a.video?.id === id) { v = a.video; open = open || a.at <= now; }
  for (const r of e.releases || []) if (r.announceVideo?.id === id) { v = r.announceVideo; open = open || r.openAt <= now; }
  for (const l of e.leeks || []) if (l.video?.id === id) { v = l.video; open = true; leek = true; } // LEEKS เปิดทันที
  // แอดมินดูตัวอย่างได้แม้ยังไม่ได้กดบันทึกประกาศ (อัปโหลดเสร็จแล้วแต่ยังไม่ผูกกับรายการ)
  if (!v && admin) { const m = await getMeta(id); if (m && m.sealed) v = { id, size: m.size, type: m.type }; }
  if (!v || (!open && !admin)) return nf();
  const size = v.size;
  const base = { "content-type": v.type, "accept-ranges": "bytes", "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox", "cross-origin-resource-policy": "same-origin",
    "cache-control": open && !admin ? "private, max-age=3600" : "private, no-store", // ไม่ใช้ public: กัน CDN แคชช่วง Range ผิดช่วง
    "content-disposition": leek && new URL(req.url).searchParams.has("dl") ? "attachment" : "inline", vary: "Range, Cookie" };
  if (req.method === "HEAD") return new Response(null, { status: 200, headers: { ...base, "content-length": String(size) } });
  // ทางสำรอง: /api/video/<id>?s=<เริ่ม>&e=<จบ> ตอบ 200 ปกติ (ไม่ใช้ Range/206) ชิ้นละไม่เกิน 1 ก้อนที่เก็บ
  const qs = new URL(req.url).searchParams;
  if (qs.has("s") && qs.has("e")) {
    const a = Number(qs.get("s")), z = Number(qs.get("e")), k = Math.floor(a / CHUNK);
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(z) || a < 0 || z < a || z >= size || Math.floor(z / CHUNK) !== k) return new Response("bad range", { status: 400 });
    const c = await readChunk(id, k);
    if (!c) return nf();
    const part = c.subarray(a - k * CHUNK, z - k * CHUNK + 1);
    return new Response(part, { status: 200, headers: { ...base, "content-length": String(part.length) } });
  }
  let start = 0, end = size - 1;
  const rg = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.get("range") || "").trim());
  if (rg && (rg[1] || rg[2])) {
    if (rg[1] === "") { start = Math.max(0, size - Number(rg[2])); }
    else { start = Number(rg[1]); if (rg[2] !== "") end = Math.min(Number(rg[2]), size - 1); }
    if (!Number.isSafeInteger(start) || start >= size || start > end) return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${size}` } });
  }
  const n = Math.floor(start / CHUNK);
  end = Math.min(end, (n + 1) * CHUNK - 1); // ส่งไม่เกิน 1 ก้อนต่อคำขอ (เบราว์เซอร์ขอส่วนต่อไปเอง)
  const buf = await readChunk(id, n);
  if (!buf) return nf();
  const body = buf.subarray(start - n * CHUNK, end - n * CHUNK + 1);
  return new Response(body, { status: 206, headers: { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(body.length) } });
};
export const config = { path: "/api/video/*" };
