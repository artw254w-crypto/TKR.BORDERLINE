import crypto from "node:crypto";
import { json, sign, verify, sameOrigin, clientIp, rateLimit, readJson, getConfig } from "../lib/shared.mjs";

// ลิงก์ดาวน์โหลดจริงจะถูกส่งให้ก็ต่อเมื่อรอครบเวลาคูลดาวน์ "ฝั่งเซิร์ฟเวอร์" แล้วเท่านั้น
export default async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await readJson(req, 2000); } catch { return json({ error: "bad_request" }, 400); }

  if (body.action === "start") {
    // อ่านค่าตั้งค่ากับตรวจ rate limit พร้อมกัน (เร็วขึ้นเพราะไม่รอทีละขั้น)
    const [cfg, allowed] = await Promise.all([
      getConfig(),
      rateLimit("dl:" + clientIp(req, ctx), 20, 10 * 60 * 1000),
    ]);
    if (cfg.status !== "ONLINE") return json({ error: "offline" }, 503);
    if (!allowed) return json({ error: "too_many" }, 429);
    const token = sign({ t: Date.now(), w: cfg.cooldownSec, n: crypto.randomBytes(8).toString("hex") });
    return json({ token, wait: cfg.cooldownSec });
  }

  if (body.action === "redeem") {
    const cfg = await getConfig();
    if (cfg.status !== "ONLINE") return json({ error: "offline" }, 503);
    const p = verify(body.token);
    if (!p) return json({ error: "invalid_token" }, 400);
    const elapsed = Date.now() - p.t;
    if (elapsed > 10 * 60 * 1000) return json({ error: "expired" }, 400);
    if (elapsed < p.w * 1000) return json({ error: "too_early" }, 403);
    return json({ url: cfg.fileUrl });
  }
  return json({ error: "bad_request" }, 400);
};
export const config = { path: "/api/download" };
