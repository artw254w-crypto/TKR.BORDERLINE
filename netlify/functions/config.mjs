import { json, getConfig, publicConfig } from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "method" }, 405);
  return json(publicConfig(await getConfig())); // ไม่ส่งลิงก์ดาวน์โหลดออกไป
};
export const config = { path: "/api/config" };
