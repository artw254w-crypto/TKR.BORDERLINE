import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

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
};

const store = () => getStore("trk-site");
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
  return { ...DEFAULTS, ...(saved || {}) };
}
export async function saveConfig(cfg) { await store().setJSON("config", cfg); }

const clean = (v, max) =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);

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
});
