// วิดีโอที่แนบกับประกาศ (ไม่ใช่ลิงก์ YouTube): เก็บเป็นก้อนละ 4 MB ใน Netlify Blobs แล้วส่งทีละก้อนตาม Range
// (ฟังก์ชัน Netlify รับ/ส่งได้ไม่เกิน ~6 MB ต่อคำขอ จึงต้องแบ่งก้อน)
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "trk-site", consistency: "strong" });
export const CHUNK = 3 * 1024 * 1024; // ฟังก์ชันรับ/ส่งได้ ~6 MB แต่ถูกแปลง base64 (+33%) จึงเหลือส่วนต่างไว้
// เพดานขนาดวิดีโอ: ค่าเริ่มต้นไม่จำกัด (ติดแค่โควตาพื้นที่ของ Netlify) ถ้าอยากจำกัดตั้ง VIDEO_MAX_MB ใน Environment variables
const MB = Number(process.env.VIDEO_MAX_MB);
export const VIDEO_MAX = Number.isFinite(MB) && MB > 0 ? MB * 1024 * 1024 : Infinity;
export const VID_RE = /^[a-f0-9]{16}$/;
export const newVid = () => crypto.randomBytes(8).toString("hex");
const metaKey = (id) => "vidmeta/" + id;
const chunkKey = (id, n) => `vid/${id}/${n}`;
const cleanName = (v) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, 120).trim();

// ตรวจชนิดจากไบต์จริง (MP4/MOV = ftyp, WebM = EBML) ไม่เชื่อนามสกุลหรือ content-type
export function sniffVideo(b) {
  if (!b || b.length < 12) return "";
  const t = String.fromCharCode(b[4], b[5], b[6], b[7]);
  // MP4/MOV/M4V ทุกแบบ: กล่องแรกอาจเป็น ftyp / moov / mdat / free / skip / wide / styp (ไฟล์จากกล้อง มือถือ โปรแกรมตัดต่อ)
  if (["ftyp", "moov", "mdat", "free", "skip", "wide", "styp", "pnot"].includes(t)) return "video/mp4";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm"; // WebM / MKV
  return "";
}
export const chunkLen = (size, n) => { const c = Math.ceil(size / CHUNK); return n < c - 1 ? CHUNK : size - (c - 1) * CHUNK; };

export async function getMeta(id) {
  if (!VID_RE.test(String(id))) return null;
  try { return (await store().get(metaKey(id), { type: "json" })) || null; } catch { return null; }
}

export async function initUpload(name, size) {
  size = Number(size);
  if (!Number.isSafeInteger(size) || size < 1024) return { error: "ไฟล์วิดีโอเล็กเกินไปหรือไม่ถูกต้อง", status: 400 };
  if (size > VIDEO_MAX) return { error: `ไฟล์ใหญ่เกิน ${VIDEO_MAX / 1048576} MB`, status: 413 };
  if (size > 5 * 1024 ** 3 * 1024) return { error: "ไฟล์ใหญ่เกินไป", status: 413 };
  const id = newVid();
  const meta = { id, name: cleanName(name) || "video", size, chunks: Math.ceil(size / CHUNK), type: "", done: [], sealed: false, createdAt: Date.now() };
  await store().setJSON(metaKey(id), meta);
  return { id, chunk: CHUNK, chunks: meta.chunks };
}

export async function putChunk(id, n, bytes) {
  const meta = await getMeta(id);
  if (!meta || meta.sealed) return { error: "ไม่พบการอัปโหลดนี้", status: 404 };
  if (!Number.isInteger(n) || n < 0 || n >= meta.chunks) return { error: "ลำดับก้อนไม่ถูกต้อง", status: 400 };
  if (bytes.length !== chunkLen(meta.size, n)) return { error: "ขนาดก้อนไม่ตรง", status: 400 };
  if (n === 0) { meta.type = sniffVideo(bytes); if (!meta.type) return { error: "รองรับเฉพาะวิดีโอ MP4 / WebM", status: 415 }; }
  await store().set(chunkKey(id, n), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  if (!meta.done.includes(n)) meta.done.push(n);
  await store().setJSON(metaKey(id), meta);
  return { ok: true, done: meta.done.length };
}

export async function finishUpload(id) {
  const meta = await getMeta(id);
  if (!meta) return { error: "ไม่พบการอัปโหลดนี้", status: 404 };
  if (meta.done.length !== meta.chunks || !meta.type) return { error: "อัปโหลดยังไม่ครบ", status: 409 };
  meta.sealed = true; meta.sealedAt = Date.now();
  await store().setJSON(metaKey(id), meta);
  return { ok: true, video: { id, name: meta.name, size: meta.size, type: meta.type } };
}

export async function readChunk(id, n) {
  const ab = await store().get(chunkKey(id, n), { type: "arrayBuffer" });
  return ab ? new Uint8Array(ab) : null;
}

export async function deleteVideo(id) {
  const meta = await getMeta(id);
  const s = store();
  const c = meta ? meta.chunks : 0;
  for (let n = 0; n < c; n++) { try { await s.delete(chunkKey(id, n)); } catch {} }
  try { await s.delete(metaKey(id)); } catch {}
}

// เติมข้อมูลวิดีโอจากเซิร์ฟเวอร์ (ไม่เชื่อค่าจากฟอร์ม) และตรวจว่าอัปโหลดเสร็จจริง
export async function resolveVideos(value) {
  const targets = [...value.announcements.map((a) => [a, "video"]), ...value.releases.map((r) => [r, "announceVideo"])];
  for (const [it, key] of targets) {
    const ref = it[key];
    if (!ref) { it[key] = null; continue; }
    const m = await getMeta(ref.id);
    if (!m || !m.sealed) return { error: "วิดีโอยังอัปโหลดไม่เสร็จหรือไม่พบไฟล์ กรุณาอัปโหลดใหม่" };
    it[key] = { id: m.id, name: m.name, size: m.size, type: m.type };
  }
  return { value };
}

export const videoIds = (e) => new Set([...(e.announcements || []).map((a) => a.video?.id), ...(e.releases || []).map((r) => r.announceVideo?.id)].filter(Boolean));

// ลบวิดีโอที่ไม่มีรายการไหนใช้แล้ว (เว้น 1 ชม. กันแท็บอื่นกำลังแนบอยู่, อัปโหลดค้างให้เวลา 6 ชม.)
export async function sweepVideos(referenced) {
  try {
    const { blobs } = await store().list({ prefix: "vidmeta/" });
    const now = Date.now();
    for (const b of blobs || []) {
      const id = b.key.slice("vidmeta/".length);
      if (referenced.has(id)) continue;
      const m = await getMeta(id);
      const age = now - (m?.createdAt || 0);
      if (!m || age > (m.sealed ? 3600e3 : 6 * 3600e3)) await deleteVideo(id);
    }
  } catch {}
}
