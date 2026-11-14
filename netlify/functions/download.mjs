import crypto from "node:crypto";
import { json, sign, verify, sameOrigin, clientIp, rateLimit, readJson, getConfig, logDownload, markClicked,
  getLog, updateLog, probeDriveCached, driveSummary } from "../lib/shared.mjs";
import { getEvents, downloadState } from "../lib/events.mjs";
import { compareVerify } from "../lib/drive.mjs";
import { r2Config, signR2Url, probeR2Cached } from "../lib/r2.mjs";

const logKey = (p) => `${String(p.t).padStart(13, "0")}-${String(p.n).replace(/[^a-f0-9]/g, "")}`;
const VERIFY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // ตรวจไฟล์ที่โหลดมาได้ภายใน 7 วันหลังขอลิงก์ (ไฟล์ใหญ่โหลดนาน)
const cleanName = (v) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);

// ลิงก์ดาวน์โหลดจริงจะถูกส่งให้ก็ต่อเมื่อรอครบเวลาคูลดาวน์ "ฝั่งเซิร์ฟเวอร์" แล้วเท่านั้น
export default async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await readJson(req, 2000); } catch { return json({ error: "bad_request" }, 400); }

  if (body.action === "start") {
    // อ่านค่าตั้งค่ากับตรวจ rate limit พร้อมกัน (เร็วขึ้นเพราะไม่รอทีละขั้น)
    const [cfg, allowed, ev] = await Promise.all([
      getConfig(),
      rateLimit("dl:" + clientIp(req, ctx), 20, 10 * 60 * 1000),
      getEvents(),
    ]);
    if (!downloadState(cfg, ev).open) return json({ error: "offline" }, 503);
    if (!allowed) return json({ error: "too_many" }, 429);
    const token = sign({ t: Date.now(), w: cfg.cooldownSec, n: crypto.randomBytes(8).toString("hex") });
    return json({ token, wait: cfg.cooldownSec });
  }

  if (body.action === "redeem") {
    const [cfg, ev] = await Promise.all([getConfig(), getEvents()]);
    if (!downloadState(cfg, ev).open) return json({ error: "offline" }, 503);
    const p = verify(body.token);
    if (!p) return json({ error: "invalid_token" }, 400);
    const elapsed = Date.now() - p.t;
    if (elapsed > 10 * 60 * 1000) return json({ error: "expired" }, 400);
    if (elapsed < p.w * 1000) return json({ error: "too_early" }, 403);
    // ตรวจ Google Drive ตอนส่งลิงก์ (แคช 60 วินาทีต่อไฟล์ จึงแทบไม่หน่วง) แล้วเก็บผลละเอียดลงประวัติ
    // ผลตรวจเป็น "error" ก็ยังส่งลิงก์ให้ตามเดิม แต่แอดมินจะเห็นสาเหตุในประวัติทันที
    // โหมด R2 (ตั้ง R2_WORKER_URL ฯลฯ ครบ): ตรวจไฟล์ใน R2 แทน และออกลิงก์ที่เซ็นแล้วชี้ไปที่ Worker (รู้ว่าโหลดจบหรือไม่)
    const r2 = r2Config();
    let drive = null;
    try {
      drive = driveSummary(r2
        ? await probeR2Cached(r2, { timeoutMs: 4000, fileMd5: cfg.fileMd5 || "" })
        : await probeDriveCached(cfg.fileUrl, { timeoutMs: 4000 }));
    } catch {}
    // บันทึกประวัติ (เกิดขึ้นที่นี่เสมอที่ลิงก์ถูกส่งออก จึงข้ามไม่ได้) ถ้าบันทึกพลาดไม่ให้กระทบการดาวน์โหลด
    try {
      await logDownload(logKey(p), {
        t: Date.now(),
        ip: clientIp(req, ctx),
        ua: (req.headers.get("user-agent") || "").slice(0, 200),
        country: ctx?.geo?.country?.code || "",
        city: ctx?.geo?.city || "",
        ver: cfg.version,
        clicked: false,
        drive,
        ...(r2 ? { src: "r2", delivery: { total: (drive && drive.size) || 0, parts: [], reqs: 0, aborted: 0, errors: 0, state: "none" } } : {}),
      });
    } catch {}
    return json({ url: r2 ? signR2Url(r2, logKey(p)) : cfg.fileUrl });
  }

  // ผู้ใช้กดปุ่ม "เริ่มดาวน์โหลด!" จริง (ใช้แยกระหว่าง "ขอลิงก์" กับ "กดดาวน์โหลดแล้ว")
  if (body.action === "confirm") {
    const p = verify(body.token);
    if (!p || Date.now() - p.t < p.w * 1000) return json({ error: "invalid_token" }, 400);
    try { await markClicked(logKey(p)); } catch {}
    return json({ ok: true });
  }

  // ผู้ใช้เลือกไฟล์ที่โหลดมาแล้วเครื่องเบราว์เซอร์ส่ง ขนาด (และ MD5) มาให้เทียบกับต้นฉบับบน Google Drive
  // รอบแรกส่งแค่ขนาด ถ้าขนาดตรงและ Drive ให้ MD5 เซิร์ฟเวอร์จะตอบ need_md5 ให้ส่งรอบสองพร้อม MD5
  if (body.action === "verify") {
    const p = verify(body.token);
    if (!p || Date.now() - p.t < p.w * 1000) return json({ error: "invalid_token" }, 400);
    if (Date.now() - p.t > VERIFY_WINDOW_MS) return json({ error: "expired" }, 400);
    const size = Number(body.size);
    const md5 = typeof body.md5 === "string" ? body.md5.toLowerCase() : "";
    if (!Number.isSafeInteger(size) || size < 0 || (md5 && !/^[a-f0-9]{32}$/.test(md5))) return json({ error: "bad_request" }, 400);
    const actual = { size, md5, name: cleanName(body.name) };

    const key = logKey(p);
    let entry = null;
    try { entry = await getLog(key); } catch {}
    if (!entry) return json({ error: "no_log" }, 404);
    if ((entry.vTries || 0) >= 30) return json({ error: "too_many" }, 429);

    // ใช้ผลตรวจ Drive ตอนออกลิงก์เป็นต้นฉบับ (ตรงกับไฟล์ที่ผู้ใช้ได้รับจริง) ถ้ายังใช้ไม่ได้ค่อยตรวจใหม่
    let drive = entry.drive;
    let reprobed = false;
    if (!drive || drive.sev === "error" || drive.size == null) {
      try {
        const c2 = await getConfig(), r2 = r2Config();
        drive = driveSummary(r2 ? await probeR2Cached(r2, { fresh: true, fileMd5: c2.fileMd5 || "" }) : await probeDriveCached(c2.fileUrl, { fresh: true }));
        reprobed = true;
      } catch {}
    }

    let result;
    if (!drive) {
      result = { final: true, status: "drive_unavailable", level: "error", title: "ตรวจไฟล์ไม่ได้: เชื่อมต่อ Google Drive เพื่อเทียบไม่สำเร็จ", detail: "ลองตรวจอีกครั้งภายหลัง" };
    } else if (drive.sev === "error") {
      result = { final: true, status: "drive_unavailable", level: "error",
        title: "ตรวจไฟล์ไม่ได้: Google Drive มีปัญหา — " + drive.title,
        detail: [drive.detail, drive.hint].filter(Boolean).join(" · ") };
    } else {
      result = compareVerify({ size: drive.size, md5: drive.md5, name: drive.name }, actual, { skipMd5: body.skipMd5 === true });
    }

    if (r2Config()) {
      const L = (t) => String(t ?? "").replace(/Google Drive/g, "ที่เก็บไฟล์").replace(/Drive/g, "ที่เก็บไฟล์");
      result = { ...result, title: L(result.title), detail: L(result.detail) };
    }

    // บันทึกผลตรวจ Drive ใหม่ทันทีแม้ยังต้องรอ MD5 (ไม่งั้นประวัติจะค้างสถานะเก่าที่ Drive เคยพัง)
    if (result.final || (reprobed && drive)) {
      try {
        await updateLog(key, (e) => ({
          ...(reprobed && drive ? { drive } : {}),
          ...(result.final ? {
            vTries: (e.vTries || 0) + 1,
            verify: { at: Date.now(), status: result.status, level: result.level, title: result.title, detail: result.detail,
              size: actual.size, md5: actual.md5, name: actual.name },
          } : {}),
        }));
      } catch {}
    }
    return json({ final: !!result.final, status: result.status, level: result.level, title: result.title, detail: result.detail });
  }
  return json({ error: "bad_request" }, 400);
};
export const config = { path: "/api/download" };
