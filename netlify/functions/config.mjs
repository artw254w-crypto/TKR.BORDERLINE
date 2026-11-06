import { json, getConfig, publicConfig } from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "method" }, 405);
  return json(publicConfig(await getConfig()), 200, {
    "netlify-cdn-cache-control": "no-store",
  }); // ไม่ส่งลิงก์ดาวน์โหลดออกไป และไม่แคช เพื่อให้สถานะเปลี่ยนทันที
};
export const config = { path: "/api/config" };
