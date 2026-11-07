import { json, isAdmin, sameOrigin, getConfig, scanStatus, deleteScan, clearScanCache } from "../lib/shared.mjs";

// แอดมินดูรายละเอียดผลสแกน/ลบผลสแกน (ลบแล้วหน้าเว็บจะกลับเป็น "ยังไม่ได้สแกน")
export default async (req) => {
  if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);
  if (req.method === "GET") {
    const v = await scanStatus(await getConfig(), { fresh: true });
    return json({ ...v, tokenSet: (process.env.SCAN_REPORT_TOKEN || "").length >= 32 });
  }
  if (req.method === "DELETE") {
    if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
    await deleteScan(); clearScanCache();
    return json({ ok: true });
  }
  return json({ error: "method" }, 405);
};
export const config = { path: "/api/admin-scan" };
