import { json, sign, safeEqual, sameOrigin, clientIp, rateLimit, readJson } from "../lib/shared.mjs";

export default async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);

  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass || adminPass.length < 12) return json({ error: "not_configured" }, 500);

  // จำกัด 8 ครั้ง / 15 นาที / IP
  if (!(await rateLimit("login:" + clientIp(req, ctx), 8, 15 * 60 * 1000)))
    return json({ error: "too_many" }, 429);

  let body;
  try { body = await readJson(req, 1000); } catch { return json({ error: "bad_request" }, 400); }

  await new Promise((r) => setTimeout(r, 400)); // หน่วงเล็กน้อยกันเดารหัสรัว ๆ
  if (typeof body.password !== "string" || body.password.length > 200 || !safeEqual(body.password, adminPass))
    return json({ error: "invalid" }, 401);

  const token = sign({ role: "admin", exp: Date.now() + 2 * 3600 * 1000 });
  return json({ ok: true }, 200, {
    "set-cookie": `trk_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=7200`,
  });
};
export const config = { path: "/api/login" };
