import { json, isAdmin, sameOrigin, readJson, getConfig, saveConfig, validateConfig } from "../lib/shared.mjs";
import { r2Config } from "../lib/r2.mjs";
import { getEvents, nextLinkedOpen } from "../lib/events.mjs";
const extra = async () => ({ r2Mode: !!r2Config(), linkedOpenAt: nextLinkedOpen(await getEvents()), now: Date.now() });

export default async (req) => {
  if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);

  // r2Mode : true = ตั้งตัวแปร R2 ครบแล้ว (ส่งไฟล์ผ่าน Cloudflare R2) ใช้แสดงสถานะในแผงแอดมินเท่านั้น
  if (req.method === "GET") return json({ ...(await getConfig()), ...(await extra()) });

  if (req.method === "PUT") {
    if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
    let body;
    try { body = await readJson(req); } catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
    const result = validateConfig(body, await getConfig());
    if (result.error) return json({ error: result.error }, 400);
    await saveConfig(result.value);
    return json({ ...result.value, ...(await extra()) });
  }
  return json({ error: "method" }, 405);
};
export const config = { path: "/api/admin-config" };
