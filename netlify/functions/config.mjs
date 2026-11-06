import { json, getConfig, publicConfig } from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "method" }, 405);
  return json(publicConfig(await getConfig()), 200, {
    "cache-control": "public, max-age=0, must-revalidate",
    "netlify-cdn-cache-control": "public, s-maxage=30, stale-while-revalidate=300",
  }); // ไม่ส่งลิงก์ดาวน์โหลดออกไป
};
export const config = { path: "/api/config" };
