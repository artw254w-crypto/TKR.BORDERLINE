import { json, isAdmin, sameOrigin, readJson, getConfig, saveConfig, validateConfig } from "../lib/shared.mjs";
import { r2Config } from "../lib/r2.mjs";
import { getEvents, saveEvents, shiftTimeline, nextLinkedOpen } from "../lib/events.mjs";
const extra = async () => ({ r2Mode: !!r2Config(), linkedOpenAt: nextLinkedOpen(await getEvents()), now: Date.now() });

export default async (req) => {
  if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);

  // r2Mode : true = ตั้งตัวแปร R2 ครบแล้ว (ส่งไฟล์ผ่าน Cloudflare R2) ใช้แสดงสถานะในแผงแอดมินเท่านั้น
  if (req.method === "GET") return json({ ...(await getConfig()), ...(await extra()) });

  if (req.method === "PUT") {
    if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
    let body;
    try { body = await readJson(req); } catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
    const prev = await getConfig();
    const wasOn = prev.siteOnline !== false, toOn = body.siteOnline === undefined ? wasOn : (body.siteOnline === true || body.siteOnline === "true");
    // ออฟไลน์ = หยุดเวลาทุกอย่าง: จำเวลาที่หยุด แล้วตอนกลับมาออนไลน์เลื่อนเวลาที่ค้างอยู่ทั้งหมดออกไปเท่ากับเวลาที่หยุด
    let shift = 0;
    if (!wasOn && toOn && prev.pausedAt > 0) {
      shift = Math.max(0, Date.now() - prev.pausedAt);
      if (prev.reopenAt > prev.pausedAt && Number(body.reopenAt) === prev.reopenAt) body.reopenAt = prev.reopenAt + shift;
    }
    const result = validateConfig(body, prev);
    if (result.error) return json({ error: result.error }, 400);
    result.value.pausedAt = wasOn && !toOn ? Date.now() : (toOn ? 0 : prev.pausedAt || 0);
    await saveConfig(result.value);
    if (shift > 0) await saveEvents(shiftTimeline(await getEvents(), prev.pausedAt, shift));
    return json({ ...result.value, ...(await extra()) });
  }
  return json({ error: "method" }, 405);
};
export const config = { path: "/api/admin-config" };
