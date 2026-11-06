import crypto from "node:crypto";
import { json, sign, verify, sameOrigin, clientIp, rateLimit, readJson, getConfig, logDownload, markClicked } from "../lib/shared.mjs";

const logKey = (p) => `${String(p.t).padStart(13, "0")}-${String(p.n).replace(/[^a-f0-9]/g, "")}`;

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
    // บันทึกประวัติ (เกิดขึ้นที่นี่เสมอที่ลิงก์ถูกส่งออก จึงข้ามไม่ได้) ถ้าบันทึกพลาดไม่ให้กระทบการดาวน์โหลด
    try {
      await logDownload(logKey(p), {
        t: Date.now(),
        ip: clientIp(req, ctx),
        ua: (req.headers.get("user-agent") || "").slice(0, 200),
        country: ctx?.geo?.country?.code || "",
        city: ctx?.geo?.city || "",
        ver: cfg.version,
        clicked: false,
      });
    } catch {}
    return json({ url: cfg.fileUrl });
  }

  // ผู้ใช้กดปุ่ม "เริ่มดาวน์โหลด!" จริง (ใช้แยกระหว่าง "ขอลิงก์" กับ "กดดาวน์โหลดแล้ว")
  if (body.action === "confirm") {
    const p = verify(body.token);
    if (!p || Date.now() - p.t < p.w * 1000) return json({ error: "invalid_token" }, 400);
    try { await markClicked(logKey(p)); } catch {}
    return json({ ok: true });
  }
  return json({ error: "bad_request" }, 400);
};
export const config = { path: "/api/download" };
