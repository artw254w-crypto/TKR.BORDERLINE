import { json, safeEqual, clientIp, rateLimit, readJson, getConfig, saveScan, validateScanReport, clearScanCache } from "../lib/shared.mjs";
import { extractFileId } from "../lib/drive.mjs";

// รับผลสแกนไวรัสจากสคริปต์ของผู้ดูแล (tools/scan-and-report.ps1 หรือ .sh)
// ยืนยันตัวตนด้วย Bearer token (ตัวแปร SCAN_REPORT_TOKEN ใน Netlify) ไม่ใช้คุกกี้ จึงไม่โดน CSRF จากเว็บอื่น
export default async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const want = process.env.SCAN_REPORT_TOKEN;
  if (!want || want.length < 32) return json({ error: "not_configured" }, 500);

  // จำกัดความถี่ก่อนตรวจรหัส (กันเดา token) และปฏิเสธไว้ก่อนถ้าที่เก็บข้อมูลมีปัญหา
  if (!(await rateLimit("scanrep:" + clientIp(req, ctx), 20, 10 * 60 * 1000, { failClosed: true })))
    return json({ error: "too_many" }, 429);

  const auth = req.headers.get("authorization") || "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!got || got.length > 200 || !safeEqual(got, want)) return json({ error: "unauthorized" }, 401);

  let body;
  try { body = await readJson(req, 8000); } catch { return json({ error: "bad_request" }, 400); }
  const v = validateScanReport(body);
  if (v.error) return json({ error: v.error }, 400);

  const cfg = await getConfig();
  const rec = { ...v.value, at: Date.now(), fileId: extractFileId(cfg.fileUrl).id || "" };
  await saveScan(rec);
  clearScanCache();
  return json({ ok: true, result: rec.result, md5: rec.md5 });
};
export const config = { path: "/api/scan-report" };
