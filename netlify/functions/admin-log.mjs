import { json, isAdmin, sameOrigin, listLogs, clearLogs, getConfig, probeDriveCached, driveSummary } from "../lib/shared.mjs";
import { r2Config, probeR2Cached } from "../lib/r2.mjs";

// ดู/ล้างประวัติการดาวน์โหลด: เฉพาะแอดมินที่ล็อกอินแล้วเท่านั้น
export default async (req) => {
  if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);

  if (req.method === "GET") {
    const url = new URL(req.url);
    // ?check=1 : ตรวจลิงก์ Google Drive ปัจจุบันสด ๆ ตอนนี้ (ข้ามแคช) ว่าผู้ใช้โหลดได้ไหม
    if (url.searchParams.get("check") === "1") {
      try {
        const cfg = await getConfig(), r2 = r2Config();
        return json({ r2: !!r2, drive: driveSummary(r2 ? await probeR2Cached(r2, { fresh: true, fileMd5: cfg.fileMd5 || "" }) : await probeDriveCached(cfg.fileUrl, { fresh: true })) });
      }
      catch { return json({ error: "check_failed" }, 500); }
    }
    const n = parseInt(url.searchParams.get("limit"), 10);
    const limit = Math.min(500, Math.max(1, Number.isFinite(n) ? n : 100));
    return json(await listLogs(limit));
  }
  if (req.method === "DELETE") {
    if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
    await clearLogs();
    return json({ ok: true });
  }
  return json({ error: "method" }, 405);
};
export const config = { path: "/api/admin-log" };
