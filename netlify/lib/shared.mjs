import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { probeDrive, extractFileId } from "./drive.mjs";

export const DEFAULTS = {
  title: "T.R.K : BORDER LINE",
  subtitle: "เกมยิงมุมมองบุคคลที่หนึ่ง (First-Person Shooter / FPS) แนวทหารเชิงยุทธวิธี สัมผัสสมรภูมิรบจำลองเสมือนจริงและภารกิจแนวหน้าสุดมันส์",
  fileUrl: "https://drive.google.com/",
  fileSize: "15.1 GB",
  version: "v1.0.0",
  os: "Windows 10/11 64-bit",
  status: "ONLINE",
  maintenanceMsg: "ขณะนี้ระบบปิดปรับปรุงชั่วคราวเพื่ออัปเดตเซิร์ฟเวอร์ กรุณากลับมาใหม่อีกครั้งในภายหลัง",
  cooldownSec: 5,
  adminClaimed: false, // true = เคยมีแอดมินล็อกอินแล้ว → ซ่อนปุ่มเฟืองจากผู้ใช้ทั่วไป (ไม่แสดงในแผงแอดมิน/ไม่ถูกแก้โดยฟอร์ม)
  img: { cover: "", bg: "" }, // รหัสเวอร์ชันของรูปที่อัปโหลด ("" = ใช้ค่าเริ่มต้น) จัดการผ่านปุ่ม "รูปภาพ" ในแผงแอดมิน
  specs: {
    min: {
      os: "Windows 10 64-bit",
      cpu: "Intel Core i5-4590 / AMD FX 8350 equivalent",
      ram: "แรม 8 GB",
      gpu: "NVIDIA GeForce RTX 2060 super",
      directx: "เวอร์ชัน 11",
      network: "",
      storage: "พื้นที่ว่างที่พร้อมใช้งาน 15 GB",
      sound: "DirectX compatible",
      notes: "Requires 64-bit processor and operating system\nIntegrated graphics cards not supported\nController support recommended for optimal experience",
    },
    rec: {
      os: "Windows 11 64-bit",
      cpu: "Intel Core i7-8700K / AMD Ryzen 5 3600",
      ram: "แรม 16 GB",
      gpu: "NVIDIA GeForce RTX 3060 / AMD Radeon RX 6600 XT",
      directx: "เวอร์ชัน 12",
      network: "การเชื่อมต่ออินเทอร์เน็ตแบบบรอดแบนด์",
      storage: "พื้นที่ว่างที่พร้อมใช้งาน 65 MB",
      sound: "DirectX compatible with surround sound support",
      notes: "SSD installation recommended for faster loading times\n1080p gaming at 60fps with High settings",
    },
  },
};

// ฟิลด์ของ "ความต้องการระบบ" (ขั้นต่ำ / แนะนำ) ใช้ชุดเดียวกัน ช่องที่เว้นว่างจะไม่แสดงบนเว็บ
export const SPEC_KEYS = ["os", "cpu", "ram", "gpu", "directx", "network", "storage", "sound", "notes"];

const store = () => getStore({ name: "trk-site", consistency: "strong" }); // อ่านค่าล่าสุดเสมอ ไม่ใช้ข้อมูลเก่าจากแคช
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "cross-origin-resource-policy": "same-origin",
      ...headers,
    },
  });

export function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ต้องยาวอย่างน้อย 32 ตัวอักษร");
  return s;
}

export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verify(token) {
  if (typeof token !== "string" || token.length > 2000) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expect = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
}

export const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

// กัน CSRF: อนุญาตเฉพาะคำขอจากเว็บเดียวกัน
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (origin) return origin === new URL(req.url).origin;
  return req.headers.get("sec-fetch-site") === "same-origin";
}

function getCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// ---- เซสชันแอดมิน ----
// ปกติอยู่ได้ 2 ชั่วโมง ถ้าติ๊ก "จดจำเครื่องนี้" จะอยู่ได้ 30 วัน (ต่ออายุให้เองเมื่อเปิดเว็บ ดู /api/session)
export const SESSION_TTL_MS = 2 * 3600 * 1000;
export const REMEMBER_TTL_MS = 30 * 24 * 3600 * 1000;

// ลายนิ้วมือของรหัสผ่านแอดมินปัจจุบัน ฝังอยู่ในเซสชัน : เปลี่ยน ADMIN_PASSWORD เมื่อไร
// เซสชันเดิมทุกอัน (รวมเครื่องที่จดจำไว้) จะใช้ไม่ได้ทันที เป็นวิธียกเลิกการจดจำเครื่องทั้งหมดในครั้งเดียว
function pwTag() {
  return crypto.createHmac("sha256", secret()).update("admin-pw:" + (process.env.ADMIN_PASSWORD || "")).digest("base64url").slice(0, 22);
}

export function issueSession(remember) {
  const ttl = remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
  const token = sign({ role: "admin", exp: Date.now() + ttl, pv: pwTag(), rem: remember ? 1 : 0 });
  return { token, cookie: `trk_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${ttl / 1000}` };
}

export const CLEAR_SESSION_COOKIE = "trk_session=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0";

// คืนข้อมูลเซสชันถ้าเป็นแอดมินที่ยังใช้ได้ ไม่งั้น null
export function adminSession(req) {
  if (!process.env.ADMIN_PASSWORD) return null;
  const p = verify(getCookie(req, "trk_session"));
  if (!p || p.role !== "admin" || !(p.exp > Date.now())) return null;
  if (typeof p.pv !== "string" || !safeEqual(p.pv, pwTag())) return null;
  return p;
}

export const isAdmin = (req) => !!adminSession(req);

export const clientIp = (req, ctx) =>
  ctx?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";

export async function readJson(req, max = 10000) {
  const text = await req.text();
  if (text.length > max) throw new Error("too_large");
  return JSON.parse(text);
}

// จำกัดจำนวนครั้งต่อ IP (ประมาณการ ไม่ atomic 100%)
// failClosed: ถ้าอ่านที่เก็บข้อมูลไม่ได้ ให้ "ปฏิเสธ" แทนที่จะปล่อยผ่าน (ใช้กับการล็อกอิน กันเลี่ยงด้วยการทำให้ที่เก็บข้อมูลล่ม)
export async function rateLimit(key, max, windowMs, opts = {}) {
  const s = store();
  const k = "rl-" + sha(key).toString("hex");
  const now = Date.now();
  let rec = null;
  try { rec = await s.get(k, { type: "json" }); } catch { if (opts.failClosed) return false; }
  if (!rec || now - rec.start > windowMs) rec = { start: now, count: 0 };
  rec.count++;
  try { await s.setJSON(k, rec); } catch {}
  return rec.count <= max;
}

export async function getConfig() {
  let saved = null;
  try { saved = await store().get("config", { type: "json" }); } catch {}
  const cfg = { ...DEFAULTS, ...(saved || {}) };
  cfg.img = { ...DEFAULTS.img, ...(saved?.img || {}) };
  cfg.specs = {
    min: { ...DEFAULTS.specs.min, ...(saved?.specs?.min || {}) },
    rec: { ...DEFAULTS.specs.rec, ...(saved?.specs?.rec || {}) },
  };
  return cfg;
}
export async function saveConfig(cfg) { await store().setJSON("config", cfg); }

// แอดมินล็อกอินสำเร็จครั้งแรก → จำไว้ว่า "มีเจ้าของแล้ว" ปุ่มเฟืองของผู้ใช้ทั่วไปจะหายไปทั้งเว็บ (เหลือเฉพาะคนที่เป็นแอดมินอยู่)
export async function claimAdmin() {
  const c = await getConfig();
  if (!c.adminClaimed) await saveConfig({ ...c, adminClaimed: true });
}

const clean = (v, max) =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);

const cleanNote = (v, max) =>
  String(v ?? "").replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, max);

function cleanSpecs(input, current) {
  const out = {};
  for (const tier of ["min", "rec"]) {
    out[tier] = {};
    for (const k of SPEC_KEYS) {
      const raw = input?.[tier]?.[k];
      const fallback = current?.[tier]?.[k] ?? "";
      const v = raw === undefined ? fallback : raw;
      out[tier][k] = k === "notes" ? cleanNote(v, 500) : clean(v, 150);
    }
  }
  return out;
}

export function validateConfig(input, current) {
  const out = { ...current };
  out.title = clean(input.title, 60);
  out.fileSize = clean(input.fileSize, 20);
  out.version = clean(input.version, 20);
  out.maintenanceMsg = clean(input.maintenanceMsg, 200);
  if (!out.title || !out.fileSize || !out.version) return { error: "กรอกชื่อเกม ขนาดไฟล์ และเวอร์ชั่นให้ครบ" };
  if (input.status !== "ONLINE" && input.status !== "OFFLINE") return { error: "สถานะไม่ถูกต้อง" };
  out.status = input.status;
  const sec = parseInt(input.cooldownSec, 10);
  if (!(sec >= 1 && sec <= 30)) return { error: "คูลดาวน์ต้องอยู่ระหว่าง 1-30 วินาที" };
  out.cooldownSec = sec;
  out.specs = cleanSpecs(input.specs, current.specs);

  let u;
  try { u = new URL(String(input.fileUrl || "")); } catch { return { error: "ลิงก์ดาวน์โหลดไม่ถูกต้อง" }; }
  const allowed = (process.env.ALLOWED_DOWNLOAD_HOSTS || "drive.google.com,drive.usercontent.google.com,docs.google.com")
    .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (u.protocol !== "https:" || u.username || u.password || u.href.length > 2000)
    return { error: "ลิงก์ต้องขึ้นต้นด้วย https:// และห้ามมีชื่อผู้ใช้/รหัสผ่านในลิงก์" };
  if (!allowed.includes(u.hostname.toLowerCase()))
    return { error: "โดเมนไม่อยู่ในรายการอนุญาต: " + allowed.join(", ") };
  out.fileUrl = u.href;
  return { value: out };
}

export const publicConfig = (c) => ({
  title: c.title, subtitle: c.subtitle, fileSize: c.fileSize, version: c.version,
  os: c.os, status: c.status, maintenanceMsg: c.maintenanceMsg, cooldownSec: c.cooldownSec,
  specs: c.specs,
  gear: !c.adminClaimed, // ยังไม่มีแอดมินล็อกอิน = ทุกคนเห็นเฟือง
  img: { cover: c.img?.cover || "", bg: c.img?.bg || "" },
});

// ---------- รูปภาพหน้าปก / พื้นหลัง (อัปโหลดจากแผงแอดมิน) ----------
// เก็บใน Blobs ที่คีย์ img/<slot>/<แฮชของรูป> (content-addressed) : URL เปลี่ยนทุกครั้งที่เปลี่ยนรูป
// จึงตั้งแคชเบราว์เซอร์/CDN ได้นานโดยไม่มีวันเห็นรูปเก่าค้าง
export const IMG_SLOTS = ["cover", "bg"];
export const IMG_MAX_BYTES = 4 * 1024 * 1024; // เพดานของฟังก์ชัน Netlify อยู่ที่ราว 6 MB เหลือส่วนต่างไว้
export const imgVersion = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 12);

// ตรวจชนิดไฟล์จากไบต์ต้นไฟล์จริง ไม่เชื่อนามสกุลหรือ content-type ที่ส่งมา รับเฉพาะ JPEG/PNG/WebP
// (ไม่รับ SVG/HTML เพราะฝังสคริปต์ได้) คืน mime หรือ null
export function sniffImage(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}
export async function putImage(slot, v, bytes) {
  await store().set(`img/${slot}/${v}`, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
export async function getImage(slot, v) {
  const ab = await store().get(`img/${slot}/${v}`, { type: "arrayBuffer" });
  return ab ? new Uint8Array(ab) : null;
}
export const deleteImage = (slot, v) => store().delete(`img/${slot}/${v}`);

// ---------- ประวัติการดาวน์โหลด (ดูได้เฉพาะแอดมิน) ----------
// คีย์ = log/<เวลา 13 หลัก>-<รหัส token> จึงเรียงตามเวลาได้ และ token เดิมไม่ถูกนับซ้ำ
const LOG_KEEP_MS = 90 * 24 * 60 * 60 * 1000; // เก็บย้อนหลัง 90 วัน แล้วลบอัตโนมัติ
const logTs = (k) => Number(k.slice(4, 17));

export async function logDownload(key, entry) { await store().setJSON("log/" + key, entry, { onlyIfNew: true }); }

export async function markClicked(key) {
  const s = store(), k = "log/" + key;
  const e = await s.get(k, { type: "json" });
  if (e && !e.clicked) { e.clicked = true; e.clickedAt = Date.now(); await s.setJSON(k, e); }
}

export const getLog = (key) => store().get("log/" + key, { type: "json" });

// แก้ไขบางฟิลด์ของรายการประวัติเดิม (คืน null ถ้าไม่พบรายการ)
export async function updateLog(key, patch) {
  const s = store(), k = "log/" + key;
  const e = await s.get(k, { type: "json" });
  if (!e) return null;
  const next = { ...e, ...(typeof patch === "function" ? patch(e) : patch) };
  await s.setJSON(k, next);
  return next;
}

// ตรวจ Google Drive แล้วแคชผลสั้น ๆ (ต่อไฟล์) กันยิงถี่ ๆ จน Google ตอบ 429 และไม่หน่วงปุ่มดาวน์โหลด
// fresh=true ข้ามแคช (ใช้ตอนแอดมินกดตรวจเองหรือเทียบไฟล์) ผลที่เป็น timeout/network ไม่แคช
const PROBE_TTL_MS = 60 * 1000;
export async function probeDriveCached(fileUrl, { fresh = false, timeoutMs = 6000 } = {}) {
  const got = extractFileId(fileUrl);
  const s = store(), k = "probe-" + (got.id || "none");
  if (!fresh && got.id) {
    try {
      const c = await s.get(k, { type: "json" });
      if (c && Date.now() - c.checkedAt < PROBE_TTL_MS) return { ...c, cached: true };
    } catch {}
  }
  const r = await probeDrive(fileUrl, { timeoutMs });
  if (got.id && r.code !== "timeout" && r.code !== "network") { try { await s.setJSON(k, r); } catch {} }
  return r;
}

// ย่อผลตรวจ Drive ให้พอดีกับที่เก็บในประวัติ (ไม่เก็บข้อมูลเกินจำเป็น)
export const driveSummary = (r) => ({
  checkedAt: r.checkedAt, sev: r.sev, code: r.code, title: r.title, hint: r.hint, detail: r.detail,
  http: r.http, apiHttp: r.apiHttp, size: r.size, md5: r.md5, name: r.name, ms: r.ms,
});

export async function listLogs(limit) {
  const s = store();
  const { blobs } = await s.list({ prefix: "log/" });
  const keys = blobs.map((b) => b.key).sort().reverse();
  const cutoff = Date.now() - LOG_KEEP_MS, day = Date.now() - 24 * 60 * 60 * 1000;
  const old = keys.filter((k) => logTs(k) < cutoff);
  if (old.length) await Promise.all(old.slice(0, 100).map((k) => s.delete(k).catch(() => {})));
  const live = keys.filter((k) => logTs(k) >= cutoff);
  const items = (await Promise.all(live.slice(0, limit).map((k) => s.get(k, { type: "json" }).catch(() => null)))).filter(Boolean);
  return { total: live.length, last24: live.filter((k) => logTs(k) >= day).length, items };
}

export async function clearLogs() {
  const s = store();
  const { blobs } = await s.list({ prefix: "log/" });
  await Promise.all(blobs.map((b) => s.delete(b.key).catch(() => {})));
}

// ---------- ผลสแกนไวรัส (ของจริง ผูกกับ MD5 ของไฟล์) ----------
// การสแกนทำด้วยเครื่องมือจริง (Microsoft Defender / ClamAV) บนเครื่องผู้ดูแล แล้วส่งผลเข้ามาที่ /api/scan-report
// (ดู tools/scan-and-report.ps1) เว็บ "ไม่เคยโชว์ว่าสแกนแล้ว" ถ้าไม่มีผลสแกนจริง และจะโชว์เขียวก็ต่อเมื่อ
// MD5 ของไฟล์ที่สแกนตรงกับ MD5 ของไฟล์ปัจจุบันบน Google Drive (ต้องตั้ง GOOGLE_API_KEY เพื่อให้เทียบได้)
export async function getScan() { try { return await store().get("scan/latest", { type: "json" }); } catch { return null; } }
export async function saveScan(rec) { await store().setJSON("scan/latest", rec); }
export async function deleteScan() { await store().delete("scan/latest"); }

const cleanStr = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
const isHex = (v, n) => typeof v === "string" && new RegExp(`^[a-f0-9]{${n}}$`).test(v);

export function validateScanReport(b) {
  if (!b || typeof b !== "object") return { error: "bad_request" };
  const md5 = String(b.md5 || "").toLowerCase(), sha256 = String(b.sha256 || "").toLowerCase();
  if (!isHex(md5, 32)) return { error: "md5 ต้องเป็นเลขฐานสิบหก 32 ตัว" };
  if (sha256 && !isHex(sha256, 64)) return { error: "sha256 ไม่ถูกต้อง" };
  if (b.result !== "clean" && b.result !== "infected") return { error: "result ต้องเป็น clean หรือ infected" };
  const size = Number(b.size);
  if (!Number.isFinite(size) || size <= 0) return { error: "size ไม่ถูกต้อง" };
  const tool = cleanStr(b.tool, 60);
  if (!tool) return { error: "ต้องระบุชื่อเครื่องมือสแกน (tool)" };
  const detections = Array.isArray(b.detections) ? b.detections.slice(0, 20).map((d) => cleanStr(d, 120)).filter(Boolean) : [];
  if (b.result === "infected" && detections.length === 0) detections.push("(ไม่ระบุชื่อภัย)");
  return {
    value: {
      result: b.result, md5, sha256, size, tool, detections,
      toolVersion: cleanStr(b.toolVersion, 40), engineVersion: cleanStr(b.engineVersion, 40),
      sigVersion: cleanStr(b.sigVersion, 40), sigDate: cleanStr(b.sigDate, 40),
      fileName: cleanStr(b.fileName, 200),
    },
  };
}

// คืนสถานะที่ "พิสูจน์ได้" : clean | unconfirmed | outdated | infected | none
const SCAN_TTL_MS = 60 * 1000;
let scanCache = null;
export async function scanStatus(cfg, { fresh = false } = {}) {
  if (!fresh && scanCache && Date.now() - scanCache.at < SCAN_TTL_MS && scanCache.url === cfg.fileUrl) return scanCache.val;
  const rec = await getScan();
  let val;
  if (!rec) {
    val = { state: "none", detail: { hasKey: !!process.env.GOOGLE_API_KEY } };
  } else {
    const id = extractFileId(cfg.fileUrl).id || "";
    let liveMd5 = "", liveSize = null;
    try {
      const live = await probeDriveCached(cfg.fileUrl, { timeoutMs: 4000, fresh });
      liveMd5 = live.md5 || ""; liveSize = live.size;
    } catch {}
    // เทียบกับไฟล์ปัจจุบัน: true = ตรงกัน, false = คนละไฟล์/ถูกเปลี่ยน, null = ยืนยันไม่ได้
    let match = null;
    if (id && rec.fileId && id !== rec.fileId) match = false;
    else if (liveMd5) match = liveMd5 === rec.md5 && (liveSize == null || liveSize === rec.size);
    let state;
    if (match === false) state = "outdated";
    else if (rec.result === "infected") state = "infected";
    else if (match === true) state = "clean";
    else state = "unconfirmed";
    val = {
      state, tool: rec.tool, at: rec.at, sigDate: rec.sigDate, md5: rec.md5, size: rec.size,
      detections: rec.detections || [],
      detail: { match, liveMd5, hasKey: !!process.env.GOOGLE_API_KEY, fileName: rec.fileName, sha256: rec.sha256,
        toolVersion: rec.toolVersion, engineVersion: rec.engineVersion, sigVersion: rec.sigVersion },
    };
  }
  scanCache = { at: Date.now(), url: cfg.fileUrl, val };
  return val;
}
export const clearScanCache = () => { scanCache = null; };
// ส่วนที่เปิดเผยต่อสาธารณะ (ไม่ส่งรายละเอียดภายใน)
export const publicScan = (v) => ({ state: v.state });
