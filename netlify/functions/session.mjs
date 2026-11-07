import { json, adminSession, issueSession, REMEMBER_TTL_MS } from "../lib/shared.mjs";

// หน้าเว็บถามที่นี่ว่า "เครื่องนี้ยังเป็นแอดมินอยู่ไหม" เพื่อตัดสินใจว่าจะโชว์ปุ่มเฟืองหรือไม่
// (เรียกเฉพาะเครื่องที่เคยล็อกอินแอดมินไว้ ผู้ใช้ทั่วไปไม่เรียก) การซ่อนปุ่มเป็นแค่ความสะดวก
// ความปลอดภัยจริงอยู่ที่ทุก /api/admin-* ตรวจเซสชันที่เซิร์ฟเวอร์เสมอ
export default async (req) => {
  if (req.method !== "GET") return json({ error: "method" }, 405);
  const p = adminSession(req);
  if (!p) return json({ admin: false });
  const headers = {};
  // เครื่องที่จดจำไว้: ต่ออายุเป็น 30 วันใหม่เมื่อผ่านไปแล้วเกิน 1 วัน (อย่างมากวันละครั้ง) ใช้เว็บเรื่อย ๆ ก็ไม่หลุด
  if (p.rem && p.exp - Date.now() < REMEMBER_TTL_MS - 24 * 3600 * 1000) headers["set-cookie"] = issueSession(true).cookie;
  return json({ admin: true, remembered: !!p.rem }, 200, headers);
};
export const config = { path: "/api/session" };
