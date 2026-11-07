import { json, getConfig, scanStatus, publicScan } from "../lib/shared.mjs";

// สถานะสแกนไวรัสสำหรับหน้าเว็บ (สาธารณะ) ถ้าตรวจอะไรไม่ได้จะตอบ none ไม่ตอบว่าปลอดภัยเด็ดขาด
export default async (req) => {
  if (req.method !== "GET") return json({ error: "method" }, 405);
  try { return json(publicScan(await scanStatus(await getConfig())), 200, { "netlify-cdn-cache-control": "no-store" }); }
  catch { return json({ state: "none", tool: "", at: 0, sigDate: "", md5: "" }); }
};
export const config = { path: "/api/scan" };
