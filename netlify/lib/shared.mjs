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

export function isAdmin(req) {
  const p = verify(getCookie(req, "trk_session"));
  return !!p && p.role === "admin" && p.exp > Date.now();
}

export const clientIp = (req, ctx) =>
  ctx?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";

export async function readJson(req, max = 10000) {
  const text = await req.text();
  if (text.length > max) throw new Error("too_large");
  return JSON.parse(text);
}

// จำกัดจำนวนครั้งต่อ IP (ประมาณการ ไม่ atomic 100%)
export async function rateLimit(key, max, windowMs) {
  const s = store();
  const k = "rl-" + sha(key).toString("hex");
  const now = Date.now();
  let rec = null;
  try { rec = await s.get(k, { type: "json" }); } catch {}
  if (!rec || now - rec.start > windowMs) rec = { start: now, count: 0 };
  rec.count++;
  try { await s.setJSON(k, rec); } catch {}
  return rec.count <= max;
}

export async function getConfig() {
  let saved = null;
  try { saved = await store().get("config", { type: "json" }); } catch {}
  const cfg = { ...DEFAULTS, ...(saved || {}) };
  cfg.specs = {
    min: { ...DEFAULTS.specs.min, ...(saved?.specs?.min || {}) },
    rec: { ...DEFAULTS.specs.rec, ...(saved?.specs?.rec || {}) },
  };
  return cfg;
}
export async function saveConfig(cfg) { await store().setJSON("config", cfg); }

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
});

// ---------- ประวัติการดาวน์โหลด (ดูได้เฉพาะแอดมิน) ----------
// คีย์ = log/<เวลา 13 หลัก>-<รหัส token> จึงเรียงตามเวลาได้ และ token เดิมไม่ถูกนับซ้ำ
const LOG_KEEP_MS = 90 * 24 * 60 * 60 * 1000; // เก็บย้อนหลัง 90 วัน แล้วลบอัตโนมัติ
const logTs = (k) => Number(k.slice(4, 17));

export async function logDownload(key, entry) { await store().setJSON("log/" + key, entry); }

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
