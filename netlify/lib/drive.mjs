// ตรวจสอบไฟล์บน Google Drive ฝั่งเซิร์ฟเวอร์ + เทียบผลไฟล์ที่ผู้ใช้โหลดมา
// ไฟล์นี้ไม่พึ่งโมดูลอื่น (ทดสอบแยกได้) ยิงไปเฉพาะโดเมน Google ที่กำหนดตายตัวเท่านั้น
// ใส่ GOOGLE_API_KEY (ไม่บังคับ) เพื่อให้ได้ MD5 + ขนาดจาก Drive API ใช้ตรวจเนื้อไฟล์ได้

const UA = "TRK-DriveCheck/1.0";
const ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

// sev: ok = พร้อมโหลด, warn = โหลดได้แต่มีข้อควรระวัง, error = ผู้ใช้โหลดไม่ได้/ผิดพลาด
export const DRIVE_CODES = {
  ok: { sev: "ok", title: "Google Drive พร้อมให้ดาวน์โหลด", hint: "" },
  bad_url: { sev: "error", title: "ลิงก์ Google Drive ไม่ถูกต้อง", hint: "ใส่ลิงก์ไฟล์ในแผง Admin ให้อยู่ในรูป https://drive.google.com/file/d/<ID>/view หรือ .../uc?id=<ID>&export=download" },
  folder: { sev: "error", title: "ลิงก์ที่ตั้งไว้เป็นโฟลเดอร์ ไม่ใช่ไฟล์", hint: "เปิดไฟล์เกมใน Drive แล้วคัดลอกลิงก์ของตัวไฟล์ (ไม่ใช่โฟลเดอร์) มาใส่แทน" },
  google_native: { sev: "error", title: "เป็นไฟล์ Google Docs/Sheets/Slides ไม่ใช่ไฟล์ให้ดาวน์โหลด", hint: "อัปโหลดไฟล์เกมจริง (ZIP/RAR) ขึ้น Drive แล้วใช้ลิงก์ของไฟล์นั้น" },
  not_found: { sev: "error", title: "ไม่พบไฟล์บน Google Drive (ถูกลบ ย้าย หรือ ID ผิด)", hint: "ตรวจว่าไฟล์ยังอยู่ใน Drive และลิงก์ในแผง Admin ถูกต้อง" },
  trashed: { sev: "error", title: "ไฟล์อยู่ในถังขยะของ Google Drive", hint: "กู้ไฟล์คืนจากถังขยะ หรืออัปโหลดใหม่แล้วอัปเดตลิงก์" },
  no_permission: { sev: "error", title: "ไฟล์ไม่ได้แชร์แบบ 'ทุกคนที่มีลิงก์' ผู้ใช้จึงเข้าถึงไม่ได้", hint: "ใน Drive กดแชร์ → การเข้าถึงทั่วไป → เปลี่ยนเป็น 'ทุกคนที่มีลิงก์' (สิทธิ์ผู้ดู)" },
  quota_exceeded: { sev: "error", title: "โควต้าดาวน์โหลดของไฟล์เต็ม (Too many users have viewed or downloaded this file)", hint: "Google จำกัดจำนวนครั้งต่อไฟล์ มักปลดล็อกเองใน ~24 ชม. ทางแก้: คัดลอกไฟล์ (Make a copy) แล้วใช้ลิงก์ของสำเนา หรือแบ่งไฟล์เป็นหลายส่วน" },
  rate_limited: { sev: "error", title: "Google จำกัดความถี่คำขอชั่วคราว (HTTP 429)", hint: "รอสักครู่แล้วลองใหม่ ถ้าเกิดซ้ำบ่อยให้ลดการเช็กถี่ ๆ" },
  drive_error: { sev: "error", title: "Google Drive ฝั่งเซิร์ฟเวอร์ขัดข้อง (HTTP 5xx)", hint: "เป็นปัญหาของ Google ชั่วคราว ลองใหม่ภายหลัง" },
  virus_scan: { sev: "warn", title: "Drive แสดงหน้าเตือนสแกนไวรัส (ไฟล์ใหญ่)", hint: "ผู้ใช้ต้องกด 'Download anyway' เอง ไม่ใช่ไฟล์เสีย" },
  html_unknown: { sev: "error", title: "Drive ตอบเป็นหน้าเว็บแทนที่จะเป็นไฟล์", hint: "ผู้ใช้จะได้ไฟล์ .html ไม่ใช่ไฟล์เกม ตรวจลิงก์และสิทธิ์การแชร์" },
  empty_file: { sev: "error", title: "ไฟล์บน Drive มีขนาด 0 ไบต์", hint: "อัปโหลดไฟล์ใหม่ให้ครบ (การอัปโหลดอาจไม่สำเร็จ)" },
  size_conflict: { sev: "warn", title: "ขนาดจาก Drive API ไม่ตรงกับขนาดที่ดาวน์โหลดได้จริง", hint: "ไฟล์อาจกำลังถูกอัปโหลด/แก้ไขอยู่ ตรวจซ้ำอีกครั้งภายหลัง" },
  timeout: { sev: "error", title: "Google Drive ตอบช้าเกินกำหนด (timeout)", hint: "อาจเป็นปัญหาเครือข่ายชั่วคราว ลองตรวจซ้ำ" },
  network: { sev: "error", title: "เชื่อมต่อ Google Drive ไม่ได้", hint: "ลองตรวจซ้ำ ถ้ายังไม่ได้ให้เช็กสถานะ Google/Netlify" },
};

export function extractFileId(urlStr) {
  let u;
  try { u = new URL(String(urlStr)); } catch { return { error: "bad_url" }; }
  if (/\/folders\//.test(u.pathname)) return { error: "folder" };
  const m = u.pathname.match(/\/d\/([^/]+)/);
  const id = (m && m[1]) || u.searchParams.get("id");
  if (!id || !ID_RE.test(id)) return { error: "bad_url" };
  return { id };
}

async function readHead(res, max = 65536) {
  try {
    const reader = res.body && res.body.getReader();
    if (!reader) return "";
    const dec = new TextDecoder();
    let out = "";
    while (out.length < max) {
      const { done, value } = await reader.read();
      if (done) break;
      out += dec.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});
    return out;
  } catch { return ""; }
}

const dropBody = (res) => { try { res.body && res.body.cancel().catch(() => {}); } catch {} };

function dispositionName(h) {
  if (!h) return "";
  let m = h.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (m) { try { return decodeURIComponent(m[1]).slice(0, 200); } catch {} }
  m = h.match(/filename\s*=\s*"([^"]+)"/i) || h.match(/filename\s*=\s*([^;]+)/i);
  return m ? m[1].trim().slice(0, 200) : "";
}

// จัดประเภทหน้า HTML ที่ Drive ตอบกลับมาแทนไฟล์
function classifyHtml(html, status) {
  if (/Too many users have viewed or downloaded|download quota|quota for this file/i.test(html)) return "quota_exceeded";
  if (/can.?t scan this file for viruses|Virus scan warning|Download anyway/i.test(html)) return "virus_scan";
  if (/file you have requested does not exist|requested URL was not found|Page Not Found/i.test(html) || status === 404) return "not_found";
  if (/Request access|You need access|You need permission|ServiceLogin|accounts\.google\.com\/(v3\/)?signin/i.test(html) || status === 401 || status === 403) return "no_permission";
  return "html_unknown";
}

export async function probeDrive(fileUrl, opts = {}) {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_API_KEY ?? "";
  const dlBase = opts.downloadBase || "https://drive.usercontent.google.com/download";
  const apiBase = opts.apiBase || "https://www.googleapis.com/drive/v3/files";
  const timeoutMs = opts.timeoutMs || 8000;
  const t0 = Date.now();
  const r = { checkedAt: t0, ok: true, sev: "ok", code: "ok", title: "", hint: "", detail: "", http: 0, apiHttp: 0,
    size: null, md5: "", name: "", mime: "", contentType: "", via: [], ms: 0 };

  const fin = (code, detail = "") => {
    const c = DRIVE_CODES[code] || DRIVE_CODES.html_unknown;
    r.code = code; r.sev = c.sev; r.ok = c.sev !== "error";
    r.title = c.title; r.hint = c.hint;
    r.detail = [detail, r.apiNote].filter(Boolean).join(" | ").slice(0, 400);
    r.ms = Date.now() - t0;
    return r;
  };

  const got = extractFileId(fileUrl);
  if (got.error) return fin(got.error, "URL: " + String(fileUrl).slice(0, 120));
  const id = got.id;

  // 1) Drive API (ถ้ามี key): ได้ขนาด + MD5 + สถานะถังขยะ
  if (apiKey) {
    try {
      const u = `${apiBase}/${id}?fields=${encodeURIComponent("id,name,size,md5Checksum,mimeType,trashed")}&supportsAllDrives=true&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
      r.via.push("api"); r.apiHttp = res.status;
      if (res.ok) {
        const j = await res.json();
        r.name = String(j.name || "").slice(0, 200);
        r.mime = String(j.mimeType || "");
        r.size = j.size != null && Number.isFinite(Number(j.size)) ? Number(j.size) : null;
        r.md5 = String(j.md5Checksum || "").toLowerCase();
        if (j.trashed) return fin("trashed", "Drive API: trashed=true");
        if (r.mime.startsWith("application/vnd.google-apps.")) return fin("google_native", "mimeType=" + r.mime);
      } else if (res.status === 404) {
        return fin("not_found", "Drive API HTTP 404");
      } else {
        r.apiNote = `Drive API HTTP ${res.status} (ข้ามไปตรวจจากลิงก์ดาวน์โหลดแทน; ถ้าเป็น 400/403 ให้ตรวจ GOOGLE_API_KEY)`;
      }
    } catch (e) {
      r.apiNote = "Drive API ใช้ไม่ได้: " + (e && e.name === "TimeoutError" ? "timeout" : "เชื่อมต่อไม่ได้");
    }
  }

  // 2) ลองขอไฟล์จริง 1 ไบต์ เหมือนที่ผู้ใช้จะโหลด (ยืนยันว่า "โหลดได้จริง")
  let res;
  try {
    res = await fetch(`${dlBase}?id=${encodeURIComponent(id)}&export=download&confirm=t`, {
      headers: { range: "bytes=0-0", "user-agent": UA, accept: "*/*" },
      redirect: "follow", signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const to = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return fin(to ? "timeout" : "network", to ? `ไม่ตอบภายใน ${timeoutMs} ms` : String((e && e.cause && e.cause.code) || (e && e.message) || "fetch failed").slice(0, 120));
  }
  r.via.push("range");
  r.http = res.status;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  r.contentType = ct.slice(0, 80);

  if (res.status === 429) { dropBody(res); return fin("rate_limited", "HTTP 429"); }
  if (res.status >= 500) { dropBody(res); return fin("drive_error", "HTTP " + res.status); }

  if (res.status === 416) {
    dropBody(res);
    if (/\*\/0\s*$/.test(res.headers.get("content-range") || "")) return fin("empty_file", "HTTP 416, Content-Range */0");
    return fin("html_unknown", "HTTP 416 (Range ไม่รองรับ)");
  }

  if (ct.startsWith("text/html") || res.status === 401 || res.status === 403 || res.status === 404) {
    const html = ct.startsWith("text/html") || res.status !== 404 ? await readHead(res) : (dropBody(res), "");
    const code = classifyHtml(html, res.status);
    const title = (html.match(/<title>([^<]{0,120})/i) || [])[1] || "";
    return fin(code, `HTTP ${res.status}, ${ct || "ไม่มี content-type"}${title ? `, หน้าเว็บชื่อ: "${title.trim()}"` : ""}`);
  }
  if (res.status !== 200 && res.status !== 206) { dropBody(res); return fin("html_unknown", "HTTP " + res.status); }

  // ได้ไฟล์จริง: อ่านขนาดจาก Content-Range (206) หรือ Content-Length (200)
  const cr = res.headers.get("content-range") || "";
  const m = cr.match(/\/(\d+)\s*$/);
  let total = null;
  if (m) total = Number(m[1]);
  else if (res.status === 200 && res.headers.get("content-length")) total = Number(res.headers.get("content-length"));
  const cdName = dispositionName(res.headers.get("content-disposition"));
  dropBody(res);
  if (!r.name && cdName) r.name = cdName;

  const via = `HTTP ${res.status}${cr ? ", Content-Range: " + cr : ""}`;
  if (total === 0) return fin("empty_file", via);
  if (r.size != null && total != null && r.size !== total) {
    return fin("size_conflict", `${via}; API=${r.size} ไบต์ แต่ดาวน์โหลดจริง=${total} ไบต์`);
  }
  if (r.size == null) r.size = total;
  return fin("ok", r.size == null ? `${via}; Drive ไม่ระบุขนาดไฟล์ จึงตรวจขนาดปลายทางไม่ได้` : via);
}

// ---------- เทียบไฟล์ที่ผู้ใช้โหลดมากับต้นฉบับบน Drive ----------
export function fmtBytes(n) {
  if (!Number.isFinite(n)) return "-";
  const u = ["ไบต์", "KB", "MB", "GB", "TB"];
  let v = n, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i ? v.toFixed(2) : String(v)) + " " + u[i] + (i ? ` (${n.toLocaleString("en-US")} ไบต์)` : "");
}

// expected = {size, md5, name} จาก Drive, actual = {size, md5, name} จากเครื่องผู้ใช้
// คืน final=false + status "need_md5" เมื่อขนาดตรงและยังต้องคำนวณ MD5 ต่อ
export function compareVerify(expected, actual, opts = {}) {
  const nameNote = expected.name && actual.name && expected.name !== actual.name &&
    !actual.name.replace(/ \(\d+\)(?=\.[^.]*$|$)/, "").startsWith(expected.name.replace(/\.[^.]*$/, ""))
    ? ` (ชื่อไฟล์ที่เลือก "${actual.name}" ไม่ตรงกับชื่อบน Drive "${expected.name}" อาจเลือกผิดไฟล์)` : "";

  if (expected.size == null) {
    return { final: true, status: "unverifiable", level: "warn",
      title: "ตรวจไม่ได้: Drive ไม่แจ้งขนาดไฟล์ต้นฉบับ",
      detail: `ขนาดไฟล์ที่เลือก ${fmtBytes(actual.size)} แต่ไม่มีขนาดต้นฉบับจาก Drive ให้เทียบ` };
  }
  if (actual.size !== expected.size) {
    const diff = expected.size - actual.size;
    const pct = expected.size ? ((actual.size / expected.size) * 100).toFixed(1) : "0";
    const how = diff > 0
      ? `ขาดไป ${fmtBytes(diff)} (ได้เพียง ${pct}%) = ดาวน์โหลดไม่ครบ/ถูกตัดกลางคัน`
      : `เกินมา ${fmtBytes(-diff)} = ไฟล์ผิดตัวหรือมีข้อมูลต่อท้าย`;
    return { final: true, status: "corrupt_size", level: "error",
      title: "ไฟล์เสีย: ขนาดไม่ตรงกับต้นฉบับบน Google Drive",
      detail: `ต้นฉบับ ${fmtBytes(expected.size)} แต่ไฟล์ที่ได้ ${fmtBytes(actual.size)} — ${how}${nameNote}. ให้ลบไฟล์นี้แล้วดาวน์โหลดใหม่` };
  }
  if (expected.md5) {
    if (actual.md5) {
      if (actual.md5 !== expected.md5) {
        return { final: true, status: "corrupt_md5", level: "error",
          title: "ไฟล์เสีย: ขนาดตรงแต่เนื้อไฟล์ไม่ตรง (MD5 ต่างจากต้นฉบับ)",
          detail: `MD5 ต้นฉบับ ${expected.md5} แต่ไฟล์ที่ได้ ${actual.md5} — ข้อมูลบางส่วนเสียหายระหว่างโหลด ให้ลบแล้วดาวน์โหลดใหม่${nameNote}` };
      }
      return { final: true, status: "ok", level: "ok",
        title: "ไฟล์สมบูรณ์: ขนาดและ MD5 ตรงกับต้นฉบับบน Google Drive",
        detail: `${fmtBytes(actual.size)} · MD5 ${actual.md5}${nameNote}` };
    }
    if (!opts.skipMd5) {
      return { final: false, status: "need_md5", level: "info", title: "ขนาดตรงกับต้นฉบับแล้ว กำลังตรวจเนื้อไฟล์ (MD5)...", detail: "" };
    }
  }
  return { final: true, status: "ok_size_only", level: "ok",
    title: "ขนาดไฟล์ตรงกับต้นฉบับบน Google Drive",
    detail: `${fmtBytes(actual.size)} ตรงกัน${expected.md5 ? " (ผู้ใช้ข้ามการตรวจ MD5)" : " (Drive ไม่ให้ MD5 จึงตรวจเนื้อไฟล์ละเอียดไม่ได้ — ถ้าแตกไฟล์แล้วขึ้น error ให้โหลดใหม่)"}${nameNote}` };
}
