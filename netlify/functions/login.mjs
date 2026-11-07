import { json, issueSession, safeEqual, sameOrigin, clientIp, rateLimit, readJson, claimAdmin } from "../lib/shared.mjs";

export default async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);

  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass || adminPass.length < 12) return json({ error: "not_configured" }, 500);

  // จำกัด 8 ครั้ง / 15 นาที / IP และ 120 ครั้ง / 15 นาที รวมทุก IP (กันเดารหัสแบบกระจายหลาย IP)
  // ถ้าอ่านที่เก็บข้อมูลไม่ได้ให้ปฏิเสธไว้ก่อน (fail-closed)
  const win = 15 * 60 * 1000;
  const [okIp, okAll] = await Promise.all([
    rateLimit("login:" + clientIp(req, ctx), 8, win, { failClosed: true }),
    rateLimit("login:all", 120, win, { failClosed: true }),
  ]);
  if (!okIp || !okAll) return json({ error: "too_many" }, 429);

  let body;
  try { body = await readJson(req, 1000); } catch { return json({ error: "bad_request" }, 400); }

  if (typeof body.password !== "string" || body.password.length > 200 || !safeEqual(body.password, adminPass))
    return json({ error: "invalid" }, 401);

  // remember=true : จดจำเครื่องนี้ 30 วัน (ไม่ต้องใส่รหัสอีก) ไม่งั้นอยู่ได้ 2 ชั่วโมง
  try { await claimAdmin(); } catch {} // ล็อกอินสำเร็จ → ซ่อนเฟืองจากผู้ใช้ทั่วไป
  const { cookie } = issueSession(body.remember === true);
  return json({ ok: true }, 200, { "set-cookie": cookie });
};
export const config = { path: "/api/login" };
