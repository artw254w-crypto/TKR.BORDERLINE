import crypto from "node:crypto";

// โหมดส่งไฟล์ผ่าน Cloudflare R2 (Worker) : เว็บรู้ว่าผู้ใช้ "โหลดจบ" หรือ "ถูกตัดกลางทาง"
// เปิดใช้เมื่อตั้งตัวแปร R2_WORKER_URL + R2_SIGNING_SECRET + R2_REPORT_TOKEN ครบใน Netlify (ถ้าไม่ตั้งจะใช้ Google Drive เหมือนเดิม)
// ไฟล์นี้ไม่พึ่งโมดูลอื่น ทดสอบแยกได้

export const DL_ID_RE = /^\d{13}-[a-f0-9]{16}$/; // รหัสประวัติ (ตรงกับ logKey ใน download.mjs)
export const LINK_TTL_SEC = 24 * 60 * 60; // ลิงก์โหลดอายุ 24 ชม. (ไฟล์ใหญ่โหลดนาน + กดโหลดต่อได้)

export function r2Config() {
  const base = String(process.env.R2_WORKER_URL || "").trim().replace(/\/+$/, "");
  const sec = String(process.env.R2_SIGNING_SECRET || "");
  const tok = String(process.env.R2_REPORT_TOKEN || "");
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(base) || sec.length < 32 || tok.length < 32) return null;
  return { base, sec, tok };
}

// ลิงก์ที่เซ็นด้วย HMAC (Worker ตรวจลายเซ็นกับเวลาหมดอายุก่อนส่งไฟล์) : /dl?i=<id>&e=<หมดอายุ วินาที>&s=<ลายเซ็น>
export function signR2Url(r2, id, ttlSec = LINK_TTL_SEC, nowMs = Date.now()) {
  const exp = Math.floor(nowMs / 1000) + ttlSec;
  const sig = crypto.createHmac("sha256", r2.sec).update(`${id}.${exp}`).digest("hex");
  return `${r2.base}/dl?i=${id}&e=${exp}&s=${sig}`;
}

// ---------- ตรวจไฟล์ใน R2 (ขนาด / MD5 / ชื่อ) ผ่าน Worker /meta ----------
// คืนรูปแบบเดียวกับผลตรวจ Drive (sev/code/title/size/md5/name ...) เพื่อใช้ร่วมกับระบบประวัติและตรวจไฟล์เดิมได้เลย
const R2_PROBE_TTL_MS = 60 * 1000;
let r2Cache = null;

const R2_TEXT = {
  ok: { sev: "ok", title: "R2 พร้อมส่งไฟล์", hint: "" },
  not_found: { sev: "error", title: "ไม่พบไฟล์ใน R2 (ยังไม่ได้อัปโหลด หรือ FILE_KEY ใน Worker ผิด)", hint: "ตรวจชื่อไฟล์ใน bucket ให้ตรงกับ FILE_KEY ใน worker/wrangler.toml" },
  unauthorized: { sev: "error", title: "Worker ปฏิเสธรหัส (R2_REPORT_TOKEN ไม่ตรงกับ REPORT_TOKEN ใน Worker)", hint: "ตั้งสองฝั่งให้เป็นค่าเดียวกันทุกตัวอักษร" },
  r2_unavailable: { sev: "error", title: "ติดต่อ Worker/R2 ไม่ได้", hint: "ตรวจว่า Worker ยังทำงาน และค่า R2_WORKER_URL ใน Netlify ถูกต้อง" },
  timeout: { sev: "error", title: "Worker/R2 ตอบช้าเกินกำหนด (timeout)", hint: "ลองตรวจซ้ำ" },
};

export async function probeR2(r2, { fileMd5 = "", timeoutMs = 4000 } = {}) {
  const t0 = Date.now();
  const mk = (code, extra = {}) => ({ checkedAt: Date.now(), code, ...R2_TEXT[code], ms: Date.now() - t0, ...extra });
  try {
    const res = await fetch(`${r2.base}/meta`, {
      headers: { authorization: `Bearer ${r2.tok}`, "user-agent": "TRK-R2Check/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) return mk("not_found", { http: 404 });
    if (res.status === 401) return mk("unauthorized", { http: 401 });
    if (!res.ok) return mk("r2_unavailable", { http: res.status, detail: `Worker ตอบ HTTP ${res.status}` });
    const m = await res.json();
    const size = Number.isSafeInteger(m.size) && m.size >= 0 ? m.size : null;
    // MD5 : ใช้ค่าที่ฝังในไฟล์ (customMetadata md5) ก่อน ถ้าไม่มีใช้ค่าที่แอดมินกรอกในแผง
    const own = typeof m.md5 === "string" && /^[a-f0-9]{32}$/i.test(m.md5) ? m.md5.toLowerCase() : "";
    const md5 = own || (/^[a-f0-9]{32}$/.test(fileMd5) ? fileMd5 : "");
    if (size === 0) return mk("r2_unavailable", { http: 200, size, md5, title: "ไฟล์ใน R2 มีขนาด 0 ไบต์", hint: "อัปโหลดไฟล์ใหม่ให้ครบ" });
    return mk("ok", { http: 200, size, md5, name: String(m.name || "").slice(0, 200) });
  } catch (e) {
    return mk(e && e.name === "TimeoutError" ? "timeout" : "r2_unavailable", { detail: String(e && e.message || e).slice(0, 150) });
  }
}

export async function probeR2Cached(r2, opts = {}) {
  const { fresh = false, fileMd5 = "" } = opts;
  if (!fresh && r2Cache && r2Cache.md5cfg === fileMd5 && Date.now() - r2Cache.at < R2_PROBE_TTL_MS) return { ...r2Cache.val, cached: true };
  const val = await probeR2(r2, opts);
  if (val.code === "ok" || val.code === "not_found") r2Cache = { at: Date.now(), md5cfg: fileMd5, val };
  return val;
}
export const clearR2Cache = () => { r2Cache = null; };

// ---------- สถานะ "โหลดจบ" จากรายงานของ Worker ----------
// Worker รายงานทุกคำขอ: start (เริ่มส่ง ช่วงไบต์ a..b) และ end (complete = ส่งครบช่วง / aborted = ผู้ใช้ตัดกลางทาง / error)
// ผลต่อรายการประวัติ: state = none | started | partial | complete
// complete = ช่วงที่ส่งครบรวมกันครบทั้งไฟล์ (รวมกรณีโหลดแบบแบ่งหลายช่วง) หรือโหลดต่อ (resume) จากจุดที่ขาดจนถึงท้ายไฟล์
const MAX_PARTS = 40;
const STALE_RUN_MS = 12 * 60 * 60 * 1000; // คำขอที่ "กำลังส่ง" เกิน 12 ชม. ถือว่าไม่มีสถานะสิ้นสุด

export function deliveryState(d, now = Date.now()) {
  const parts = Array.isArray(d && d.parts) ? d.parts : [];
  const total = d && d.total;
  if (!parts.length || !(total > 0)) return "none";
  const live = (p) => p.s === "run" && now - p.t < STALE_RUN_MS; // กำลังส่งอยู่จริง
  const oks = parts.filter((p) => p.s === "ok").sort((x, y) => x.a - y.a);
  // คำขอ "ถึงท้ายไฟล์" ที่ถูกตัดกลางทาง (ไม่ใช่ช่วงที่ตัวจัดการโหลดแบ่งไว้) ใช้ประกอบการนับโหลดต่อ
  const openCut = parts.filter((p) => p.s !== "ok" && !live(p) && p.b === total - 1);
  let cur = 0; // ไบต์แรกที่ยังไม่ได้นับ
  for (const p of oks) {
    if (p.a <= cur) cur = Math.max(cur, p.b + 1);
    else if (openCut.some((o) => o.a <= cur)) cur = Math.max(cur, p.b + 1); // โหลดต่อ (resume) จากไบต์ที่ได้ไปแล้ว
    else break; // ขาดช่วงที่ไม่มีหลักฐานว่าส่งแล้ว
  }
  if (cur >= total) return "complete";
  if (parts.some(live)) return "started";
  return "partial";
}

export function applyDeliveryEvent(prev, ev, now = Date.now()) {
  const d = { total: ev.total, parts: [], reqs: 0, aborted: 0, errors: 0, firstAt: now, ...(prev || {}) };
  d.total = ev.total;
  d.parts = (Array.isArray(d.parts) ? d.parts : []).slice();
  let p = d.parts.find((x) => x.r === ev.r);
  if (ev.ev === "start") {
    if (!p) { d.reqs++; d.parts.push({ r: ev.r, a: ev.a, b: ev.b, s: "run", t: now }); }
  } else {
    const s = ev.status === "complete" ? "ok" : ev.status === "error" ? "err" : "abort";
    if (!p) { d.reqs++; p = { r: ev.r, a: ev.a, b: ev.b, s, t: now }; d.parts.push(p); }
    else if (p.s === "run") { p.s = s; p.t = now; }
    else return { ...d, state: deliveryState(d, now) }; // รายงานซ้ำ ไม่นับซ้ำ
    if (s === "abort") d.aborted++;
    if (s === "err") d.errors++;
  }
  // กันรายการบวมเมื่อผู้ใช้ลองโหลดหลายสิบครั้ง : ตัดรายการเก่าที่ไม่สำเร็จก่อน
  while (d.parts.length > MAX_PARTS) {
    const i = d.parts.findIndex((x) => x.s === "abort" || x.s === "err");
    d.parts.splice(i >= 0 ? i : 0, 1);
  }
  d.lastAt = now;
  d.state = deliveryState(d, now);
  if (d.state === "complete" && !d.doneAt) d.doneAt = now;
  return d;
}

export function validateDeliveryReport(b) {
  if (!b || typeof b !== "object") return { error: "bad_request" };
  const id = String(b.id || ""), r = String(b.r || "");
  if (!DL_ID_RE.test(id)) return { error: "bad_id" };
  if (!/^[a-f0-9]{8,16}$/.test(r)) return { error: "bad_request_id" };
  if (b.ev !== "start" && b.ev !== "end") return { error: "bad_event" };
  const status = b.ev === "end" ? String(b.status || "") : "";
  if (b.ev === "end" && !["complete", "aborted", "error"].includes(status)) return { error: "bad_status" };
  const a = Number(b.a), e = Number(b.b), total = Number(b.total);
  if (![a, e, total].every(Number.isSafeInteger) || total <= 0 || a < 0 || e < a || e >= total) return { error: "bad_range" };
  return { value: { id, r, ev: b.ev, status, a, b: e, total } };
}
