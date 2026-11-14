import { json, getConfig, publicConfig } from "../lib/shared.mjs";
import { getEvents, downloadState } from "../lib/events.mjs";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "method" }, 405);
  const [cfg, ev] = await Promise.all([getConfig(), getEvents()]);
  const st = downloadState(cfg, ev);
  // status = สถานะที่ใช้จริงตอนนี้ (ปิดปรับปรุง หรือรอเวลาเปิด = OFFLINE) openAt = เวลาที่จะเปิด (นับถอยหลัง) now = เวลาเซิร์ฟเวอร์
  return json({ ...publicConfig(cfg), status: st.open ? "ONLINE" : "OFFLINE", openAt: st.openAt || (cfg.status === "OFFLINE" && cfg.reopenAt > Date.now() ? cfg.reopenAt : 0), now: Date.now() }, 200, {
    "netlify-cdn-cache-control": "no-store",
  }); // ไม่ส่งลิงก์ดาวน์โหลดออกไป และไม่แคช เพื่อให้สถานะเปลี่ยนทันที
};
export const config = { path: "/api/config" };
