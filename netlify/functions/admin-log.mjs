import { json, isAdmin, sameOrigin, listLogs, clearLogs } from "../lib/shared.mjs";

// ดู/ล้างประวัติการดาวน์โหลด: เฉพาะแอดมินที่ล็อกอินแล้วเท่านั้น
export default async (req) => {
  if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);

  if (req.method === "GET") {
    const n = parseInt(new URL(req.url).searchParams.get("limit"), 10);
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
