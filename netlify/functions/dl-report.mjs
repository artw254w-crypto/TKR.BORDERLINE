import { json, safeEqual, readJson, updateLog } from "../lib/shared.mjs";
import { r2Config, applyDeliveryEvent, validateDeliveryReport } from "../lib/r2.mjs";

// รับรายงานจาก Cloudflare Worker ว่าผู้ใช้ "เริ่มโหลด" / "โหลดจบ" / "ถูกตัดกลางทาง"
// ยืนยันตัวตนด้วย Bearer token (R2_REPORT_TOKEN) ไม่ใช้คุกกี้ ไม่รับจากเบราว์เซอร์ผู้ใช้
export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const r2 = r2Config();
  if (!r2) return json({ error: "not_configured" }, 500);

  const auth = req.headers.get("authorization") || "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!got || got.length > 200 || !safeEqual(got, r2.tok)) return json({ error: "unauthorized" }, 401);

  let body;
  try { body = await readJson(req, 2000); } catch { return json({ error: "bad_request" }, 400); }
  const v = validateDeliveryReport(body);
  if (v.error) return json({ error: v.error }, 400);

  const ev = v.value;
  let found = null;
  try { found = await updateLog(ev.id, (e) => ({ delivery: applyDeliveryEvent(e.delivery, ev) })); } catch { return json({ error: "store_error" }, 500); }
  return json({ ok: true, found: !!found });
};
export const config = { path: "/api/dl-report" };
