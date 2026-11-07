import { json, isAdmin, sameOrigin, clientIp, rateLimit, getConfig, saveConfig,
  IMG_SLOTS, IMG_MAX_BYTES, imgVersion, sniffImage, putImage, deleteImage } from "../lib/shared.mjs";

// อัปโหลด / ลบรูปหน้าปกและพื้นหลัง (แอดมินเท่านั้น)
//   PUT    /api/admin-image?slot=cover|bg   body = ไบต์ของรูป (JPEG/PNG/WebP ไม่เกิน 4 MB)
//   DELETE /api/admin-image?slot=cover|bg   กลับไปใช้ค่าเริ่มต้น
export default async (req, ctx) => {
  if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const slot = new URL(req.url).searchParams.get("slot");
  if (!IMG_SLOTS.includes(slot)) return json({ error: "bad_slot" }, 400);

  if (req.method === "PUT") {
    if (!(await rateLimit("img:" + clientIp(req, ctx), 30, 10 * 60 * 1000))) return json({ error: "too_many" }, 429);
    if (Number(req.headers.get("content-length") || 0) > IMG_MAX_BYTES) return json({ error: "too_large", max: IMG_MAX_BYTES }, 413);
    let bytes;
    try { bytes = new Uint8Array(await req.arrayBuffer()); } catch { return json({ error: "bad_request" }, 400); }
    if (bytes.length > IMG_MAX_BYTES) return json({ error: "too_large", max: IMG_MAX_BYTES }, 413);
    const type = sniffImage(bytes);
    if (!type) return json({ error: "bad_type" }, 415);

    const v = imgVersion(bytes);
    await putImage(slot, v, bytes);
    const cfg = await getConfig();
    const prev = cfg.img?.[slot] || "";
    cfg.img = { ...cfg.img, [slot]: v };
    await saveConfig(cfg);
    if (prev && prev !== v) { try { await deleteImage(slot, prev); } catch {} } // ลบรูปเก่า ไม่ให้พื้นที่เก็บบวม
    return json({ ok: true, slot, v, bytes: bytes.length, type, img: cfg.img });
  }

  if (req.method === "DELETE") {
    const cfg = await getConfig();
    const prev = cfg.img?.[slot] || "";
    cfg.img = { ...cfg.img, [slot]: "" };
    await saveConfig(cfg);
    if (prev) { try { await deleteImage(slot, prev); } catch {} }
    return json({ ok: true, slot, img: cfg.img });
  }
  return json({ error: "method" }, 405);
};
export const config = { path: "/api/admin-image" };
