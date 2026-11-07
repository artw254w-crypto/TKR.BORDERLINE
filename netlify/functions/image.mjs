import { getImage, sniffImage } from "../lib/shared.mjs";

// ส่งรูปหน้าปก/พื้นหลังให้ทุกคน  GET /api/image/<cover|bg>/<แฮช 12 ตัว>
// แฮชอยู่ใน path (ไม่ใช่ query) เพื่อให้แคชแยกตามเวอร์ชันแน่นอน จึงแคชได้ 1 ปีแบบ immutable
export default async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method", { status: 405 });
  const m = new URL(req.url).pathname.match(/^\/api\/image\/(cover|bg)\/([a-f0-9]{12})$/);
  const notFound = () => new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
  if (!m) return notFound();
  let bytes = null;
  try { bytes = await getImage(m[1], m[2]); } catch {}
  const type = bytes && sniffImage(bytes);
  if (!type) return notFound();
  return new Response(req.method === "HEAD" ? null : bytes, {
    status: 200,
    headers: {
      "content-type": type, // มาจากการตรวจไบต์จริง ไม่ใช่ค่าที่ผู้อัปโหลดส่งมา
      "content-length": String(bytes.length),
      "cache-control": "public, max-age=31536000, immutable",
      etag: `"${m[2]}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
    },
  });
};
export const config = { path: "/api/image/*" };
