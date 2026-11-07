"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  // โหลดฟอนต์แบบไม่บล็อกการแสดงผล (หน้าเว็บขึ้นทันที แล้วฟอนต์ค่อยสลับเข้ามา)
  { const l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Prompt:wght@300;400;600;700&display=swap";
    document.head.appendChild(l); }
  let cfg = null, timer = null, popupRun = 0, saving = false, adminUi = false;
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("trk-cfg") : null;

  async function api(path, method = "GET", body) {
    try {
      const res = await fetch(path, {
        method, cache: "no-store", credentials: "same-origin",
        headers: body ? { "content-type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try { data = await res.json(); } catch {}
      return { ok: res.ok, status: res.status, data: data || {} };
    } catch {
      return { ok: false, status: 0, data: {} };
    }
  }

  const show = (id) => { $(id).hidden = false; };
  const hide = (id) => { $(id).hidden = true; };

  /* ---------- ความต้องการระบบ ---------- */
  const SPEC_FIELDS = [
    ["os", "ระบบปฏิบัติการ"], ["cpu", "โปรเซสเซอร์"], ["ram", "หน่วยความจำ"], ["gpu", "กราฟิกส์"],
    ["directx", "DirectX"], ["network", "เครือข่าย"], ["storage", "พื้นที่จัดเก็บข้อมูล"],
    ["sound", "การเสียง"], ["notes", "หมายเหตุเพิ่มเติม"],
  ];

  function renderSpecTier(boxId, listId, data) {
    const list = $(listId); list.replaceChildren();
    let n = 0;
    for (const [k, label] of SPEC_FIELDS) {
      const v = data && data[k];
      if (!v) continue;
      n++;
      const row = document.createElement("div");
      row.className = "srow" + (k === "notes" ? " note" : "");
      const b = document.createElement("b"); b.textContent = label + ": ";
      const sp = document.createElement("span"); sp.textContent = v;
      row.append(b, sp);
      list.appendChild(row);
    }
    $(boxId).hidden = n === 0;
    return n;
  }

  function renderSpecs(specs) {
    const a = renderSpecTier("specMinBox", "specMin", specs && specs.min);
    const b = renderSpecTier("specRecBox", "specRec", specs && specs.rec);
    $("specs").hidden = a + b === 0;
  }

  // สร้างช่องกรอกของแผงแอดมิน (ครั้งเดียว)
  function buildSpecInputs() {
    for (const [tier, id] of [["min", "aSpecMin"], ["rec", "aSpecRec"]]) {
      const box = $(id);
      for (const [k, label] of SPEC_FIELDS) {
        const lab = document.createElement("label");
        lab.textContent = label;
        const el = document.createElement(k === "notes" ? "textarea" : "input");
        if (k !== "notes") el.type = "text";
        el.id = `spec-${tier}-${k}`;
        el.maxLength = k === "notes" ? 500 : 150;
        lab.appendChild(el);
        box.appendChild(lab);
      }
    }
  }

  const readSpecInputs = () => {
    const out = { min: {}, rec: {} };
    for (const tier of ["min", "rec"]) for (const [k] of SPEC_FIELDS) out[tier][k] = $(`spec-${tier}-${k}`).value;
    return out;
  };
  const fillSpecInputs = (specs) => {
    for (const tier of ["min", "rec"]) for (const [k] of SPEC_FIELDS)
      $(`spec-${tier}-${k}`).value = (specs && specs[tier] && specs[tier][k]) || "";
  };

  // ใช้ textContent ทั้งหมด ไม่มี innerHTML กับข้อมูลที่มาจากผู้ใช้/เซิร์ฟเวอร์ (กัน XSS)
  function render() {
    if (!cfg) return;
    applyGear();
    const on = cfg.status === "ONLINE";
    $("title").textContent = cfg.title;
    document.title = cfg.title;
    $("subtitle").textContent = cfg.subtitle;
    $("size").textContent = cfg.fileSize;
    $("version").textContent = cfg.version;
    $("os").textContent = cfg.os;
    $("hBadge").classList.toggle("off", !on);
    $("hStatus").textContent = on ? "SERVER ONLINE" : "MAINTENANCE";
    $("gridStatus").textContent = on ? "🟢 พร้อมใช้งาน (Ready)" : "🔴 ปิดปรับปรุง (Offline)";
    $("notice").classList.toggle("off", !on);
    $("noticeIcon").textContent = on ? "✔" : "⚠";
    $("noticeTitle").textContent = on ? "ไฟล์พร้อมสำหรับการดาวน์โหลด" : "ระบบไม่พร้อมดาวน์โหลดชั่วคราว";
    $("noticeDesc").textContent = on
      ? "ลิงก์ตรงผ่าน Google Drive ความเร็วสูง กรุณาเตรียมพื้นที่ไดรฟ์อย่างน้อย 20 GB"
      : cfg.maintenanceMsg || "อยู่ระหว่างการปรับปรุงระบบ";
    $("dlBtn").disabled = !on;
    $("dlText").textContent = on ? "🚀 พร้อมดาวน์โหลด (คลิกที่นี่)" : "🔒 ระบบปิดปรับปรุงชั่วคราว";
    renderSpecs(cfg.specs);
    applyImages(cfg.img);
  }

  async function loadConfig() {
    const r = await api("/api/config");
    if (r.ok) { cfg = r.data; render(); if (bc) bc.postMessage({ cfg }); }
    else {
      $("title").textContent = "T.R.K : BORDER LINE";
      $("noticeDesc").textContent = "โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้านี้";
    }
  }

  /* ---------- ดาวน์โหลด (เซิร์ฟเวอร์ตรวจเวลาคูลดาวน์) ---------- */
  function closePopup() { popupRun++; clearInterval(timer); hide("popup"); }

  const isUrl = (u) => typeof u === "string" && u.startsWith("https://");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const errText = (st) => st === 429 ? "คุณกดบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่"
    : st === 503 ? "ระบบปิดปรับปรุงอยู่ในขณะนี้" : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";

  function showError(status) {
    clearInterval(timer);
    $("count").textContent = "✖";
    $("popMsg").textContent = errText(status);
    $("prog").style.width = "0%";
    const go = $("popGo"); go.disabled = true; go.onclick = null; go.textContent = "⏳ กำลังเตรียม...";
  }

  // กดแล้วป๊อปอัปเปิดและนับถอยหลังทันที (ไม่รอเซิร์ฟเวอร์) ส่วนการขอ token ทำพร้อมกันเบื้องหลัง
  // เมื่อครบเวลาระบบขอลิงก์รอไว้ให้ ปุ่มดาวน์โหลดจึงกดแล้วไปเลย เซิร์ฟเวอร์ยังตรวจคูลดาวน์เองเหมือนเดิม
  function startDownload() {
    if (cfg && cfg.status !== "ONLINE") return;
    const run = ++popupRun;
    clearInterval(timer);
    const go = $("popGo"), prog = $("prog");
    const total = (cfg && cfg.cooldownSec) || 5;
    let left = total;

    go.disabled = true; go.onclick = null; go.textContent = `⏳ กำลังเตรียมไฟล์ (${left}s)...`;
    $("popMsg").textContent = "ระบบกำลังเตรียมลิงก์ดาวน์โหลดให้ รอสักครู่นะ";
    $("count").textContent = left;
    prog.style.transition = "none"; prog.style.width = "100%"; void prog.offsetWidth; prog.style.transition = "";
    show("popup");
    requestAnimationFrame(() => { prog.style.width = ((left - 1) / total) * 100 + "%"; });

    const started = api("/api/download", "POST", { action: "start" });
    started.then((s) => { if (run === popupRun && !s.ok) showError(s.status); });

    const finish = async () => {
      go.textContent = "🚀 กำลังเปิดลิงก์...";
      const s = await started;
      if (run !== popupRun || !s.ok) return;
      let r = { ok: false, status: 0, data: {} };
      // token ถูกออกหลังกดเล็กน้อย จึงลองซ้ำสั้น ๆ จนเซิร์ฟเวอร์ยืนยันว่าครบเวลา
      for (let i = 0; i < 40; i++) {
        r = await api("/api/download", "POST", { action: "redeem", token: s.data.token });
        if (run !== popupRun) return;
        if (r.status !== 403) break;
        await sleep(250);
      }
      if (r.ok && isUrl(r.data.url)) {
        const url = r.data.url;
        go.disabled = false; go.textContent = "🚀 เริ่มดาวน์โหลด!";
        go.onclick = () => {
          // แจ้งเซิร์ฟเวอร์ว่ากดดาวน์โหลดจริง (เพื่อบันทึกประวัติ) แล้วไปต่อทันที ไม่รอผล
          fetch("/api/download", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "confirm", token: s.data.token }), keepalive: true }).catch(() => {});
          saveToken(s.data.token);
          closePopup(); window.location.href = url;
        };
      } else {
        $("popMsg").textContent = "ขอลิงก์ไม่สำเร็จ กรุณากดยกเลิกแล้วลองใหม่";
      }
    };

    timer = setInterval(() => {
      left--;
      if (left > 0) {
        $("count").textContent = left;
        prog.style.width = ((left - 1) / total) * 100 + "%";
        go.textContent = `⏳ กำลังเตรียมไฟล์ (${left}s)...`;
        return;
      }
      clearInterval(timer);
      $("count").textContent = "✨";
      finish();
    }, 1000);
  }

  /* ---------- ตรวจไฟล์ที่ดาวน์โหลดมา เทียบกับต้นฉบับบน Google Drive ---------- */
  // เว็บไม่มีทางรู้เองว่าเบราว์เซอร์โหลดจบ/ไฟล์เสียหรือไม่ จึงให้ผู้ใช้เลือกไฟล์ที่โหลดมา
  // แล้วคำนวณขนาด (+MD5) ในเครื่อง ส่งเฉพาะตัวเลขให้เซิร์ฟเวอร์เทียบกับ Drive และบันทึกลงประวัติ
  const TOKEN_KEY = "trk_last_dl";
  const saveToken = (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch {} };
  const loadToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
  let vRun = 0, vSkipMd5 = false;

  function vResult(level, title, detail) {
    const box = $("vRes"); box.className = "vres " + level;
    $("vTitle").textContent = title; $("vDetail").textContent = detail || ""; box.hidden = false;
  }
  function vNote(text) { const m = $("vMsg"); m.textContent = text || ""; m.hidden = !text; }
  function vBusy(on) {
    $("vGo").disabled = on; $("vFile").disabled = on; $("vProgWrap").hidden = !on;
    if (!on) $("vSkip").hidden = true;
  }
  const vAlive = (run) => run === vRun && !$("verify").hidden;

  function openVerify() {
    vRun++; vSkipMd5 = false;
    $("vFile").value = ""; $("vProg").style.width = "0%";
    vBusy(false); vNote(""); $("vRes").hidden = true;
    show("verify");
  }

  // อ่านไฟล์ทีละ 8 MB แล้วป้อนเข้า MD5 (ไม่โหลดทั้งไฟล์เข้าหน่วยความจำ) คืน null ถ้าผู้ใช้กดข้ามหรือปิดหน้าต่าง
  async function md5File(file, run) {
    const h = TRKMD5.create(), CH = 8 * 1024 * 1024;
    for (let o = 0; o < file.size; o += CH) {
      if (vSkipMd5 || !vAlive(run)) return null;
      h.update(new Uint8Array(await file.slice(o, o + CH).arrayBuffer()));
      $("vProg").style.width = (Math.min(1, (o + CH) / file.size) * 100).toFixed(1) + "%";
    }
    return h.hex();
  }

  const verifyErr = (r) => r.status === 0 ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่"
    : r.data.error === "expired" || r.data.error === "invalid_token" ? "การขอดาวน์โหลดครั้งล่าสุดหมดอายุหรือไม่ถูกต้อง (ตรวจได้ภายใน 7 วันหลังกดดาวน์โหลด) กรุณากดดาวน์โหลดใหม่แล้วตรวจอีกครั้ง"
    : r.data.error === "no_log" ? "ไม่พบรายการดาวน์โหลดนี้ในระบบ กรุณากดดาวน์โหลดใหม่"
    : r.status === 429 ? "ตรวจบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่"
    : "เซิร์ฟเวอร์ตรวจไฟล์ไม่สำเร็จ (" + (r.data.error || "HTTP " + r.status) + ") กรุณาลองใหม่";

  async function runVerify() {
    const f = $("vFile").files && $("vFile").files[0];
    $("vRes").hidden = true;
    if (!f) { vNote("กรุณาเลือกไฟล์ที่ดาวน์โหลดมาก่อน"); return; }
    const token = loadToken();
    if (!token) {
      vNote("");
      vResult("warn", "ยังไม่พบการดาวน์โหลดในเบราว์เซอร์นี้", "กดปุ่มดาวน์โหลดจากหน้านี้ก่อน แล้วค่อยกลับมาตรวจไฟล์ (ระบบต้องรู้ว่าไฟล์ของคุณมาจากการขอดาวน์โหลดครั้งไหน)");
      return;
    }
    const run = ++vRun; vSkipMd5 = false;
    vBusy(true); $("vProg").style.width = "0%"; vNote("กำลังเทียบขนาดไฟล์กับ Google Drive...");
    const post = (extra) => api("/api/download", "POST", { action: "verify", token, size: f.size, name: f.name, ...extra });

    let r = await post({});
    if (!vAlive(run)) return;
    if (r.ok && r.data.final === false && r.data.status === "need_md5") {
      $("vSkip").hidden = false;
      vNote("ขนาดตรงกันแล้ว กำลังตรวจเนื้อไฟล์ (MD5) ไฟล์ใหญ่ใช้เวลาสักครู่ อย่าปิดหน้านี้");
      let md5;
      try { md5 = await md5File(f, run); }
      catch {
        if (!vAlive(run)) return;
        vBusy(false); vNote("");
        vResult("error", "อ่านไฟล์ไม่สำเร็จ", "เบราว์เซอร์อ่านไฟล์นี้ไม่ได้ (ไฟล์ถูกลบ/ย้าย/ถูกโปรแกรมอื่นใช้อยู่ หรือไฟล์เสียหาย) ลองเลือกไฟล์ใหม่ หรือดาวน์โหลดใหม่");
        return;
      }
      if (!vAlive(run)) return;
      vNote("กำลังเทียบผลกับ Google Drive...");
      r = await post(md5 ? { md5 } : { skipMd5: true });
      if (!vAlive(run)) return;
    }
    vBusy(false); vNote("");
    if (r.ok) vResult(r.data.level === "ok" ? "ok" : r.data.level === "error" ? "error" : "warn", r.data.title, r.data.detail);
    else vResult("error", "ตรวจไฟล์ไม่สำเร็จ", verifyErr(r));
  }

  /* ---------- รูปกรอบหน้าปก + รูปพื้นหลัง (อัปโหลดจากแผงแอดมิน) ---------- */
  // รูปอยู่ที่ /api/image/<ช่อง>/<แฮช> (เปลี่ยนรูป = แฮชเปลี่ยน = เบราว์เซอร์ดึงใหม่เอง) ไม่มีรูปที่อัปโหลด = ใช้ค่าเริ่มต้น
  // ตั้งรูปพื้นหลังผ่านตัวแปร CSS (--bg-img) ด้วย CSSOM ซึ่ง CSP ที่เข้มงวดอนุญาต (ไม่ใช้ inline style)
  const IMG_CACHE = "trk_imgs", COVER_DEFAULT = "/cover-default.jpg";
  const imgUrl = (slot, v) => (v ? `/api/image/${slot}/${v}` : "");
  function paintImages(cover, bg) {
    const el = $("coverImg");
    if (el.getAttribute("src") !== cover) { el.hidden = false; $("coverHero").hidden = true; el.src = cover; }
    document.documentElement.style.setProperty("--bg-img", bg ? `url("${bg}")` : "none");
  }
  function applyImages(img) {
    const cover = imgUrl("cover", img && img.cover) || COVER_DEFAULT, bg = imgUrl("bg", img && img.bg);
    paintImages(cover, bg);
    try { localStorage.setItem(IMG_CACHE, JSON.stringify({ cover, bg })); } catch {}
  }
  // รูปเดิมที่เคยโหลดไว้ แสดงทันทีตอนเปิดหน้า (ไม่ต้องรอ /api/config) แล้วค่อยยืนยันกับเซิร์ฟเวอร์
  try {
    const c = JSON.parse(localStorage.getItem(IMG_CACHE) || "null");
    if (c && typeof c.cover === "string" && c.cover.startsWith("/") && (!c.bg || (typeof c.bg === "string" && c.bg.startsWith("/api/image/")))) paintImages(c.cover, c.bg || "");
  } catch {}
  // รูปโหลดไม่ขึ้น (ถูกลบ/เน็ตมีปัญหา) : ซ่อนรูป โชว์ไอคอนแทน ไม่ให้เห็นกรอบรูปเสีย
  $("coverImg").addEventListener("error", () => { $("coverImg").hidden = true; $("coverHero").hidden = false; });

  /* ---------- Admin (เปิดหน้าต่างทันที แล้วค่อยโหลดข้อมูลเบื้องหลัง) ---------- */
  let adminHint = false, adminCfg = null;
  buildSpecInputs();

  // เครื่องแอดมิน: ปุ่มเฟือง/ลิงก์ footer ซ่อนไว้สำหรับทุกคน และโชว์เฉพาะเครื่องที่เซิร์ฟเวอร์ยืนยันว่าเป็นแอดมิน
  // "trk_admin" ใน localStorage เป็นแค่ข้อสังเกตว่าเครื่องนี้เคยล็อกอินแอดมิน (ไม่ใช่รหัสผ่าน/โทเคน ปลอมได้แต่ไม่ได้อะไร
  // เพราะทุก API แอดมินตรวจเซสชันที่เซิร์ฟเวอร์) ผู้ใช้ทั่วไปจึงไม่เห็นเฟืองและไม่ยิงคำขอตรวจเซสชันเลย
  const HINT_KEY = "trk_admin";
  const setHint = (on) => { try { on ? localStorage.setItem(HINT_KEY, "1") : localStorage.removeItem(HINT_KEY); } catch {} };
  const hasHint = () => { try { return localStorage.getItem(HINT_KEY) === "1"; } catch { return false; } };
  // เฟืองโชว์เมื่อ (ก) ยังไม่เคยมีแอดมินล็อกอินเลย (cfg.gear) ทุกคนเห็น หรือ (ข) เครื่องนี้เป็นแอดมินอยู่
  // พอมีแอดมินล็อกอินแล้ว cfg.gear เป็น false → ผู้ใช้ทั่วไปเฟืองหายภายใน ~4 วินาที เหลือเฉพาะแอดมิน
  function applyGear() {
    const on = adminUi || !!(cfg && cfg.gear);
    $("gearBtn").hidden = !on; $("footAdmin").hidden = !on;
  }
  function showAdminUi(on) { adminUi = on; applyGear(); }
  function adminGained() { adminHint = true; setHint(true); showAdminUi(true); }
  function adminLost() { adminHint = false; adminCfg = null; setHint(false); showAdminUi(false); }

  function openLogin() {
    $("pass").value = ""; hide("loginErr"); show("login");
    $("pass").focus();
  }

  function fillForm(c) {
    $("fUrl").value = c.fileUrl; $("fTitle").value = c.title; $("fSize").value = c.fileSize;
    $("fVer").value = c.version; $("fMsg").value = c.maintenanceMsg; $("fCool").value = c.cooldownSec;
    document.querySelector(`input[name="status"][value="${c.status === "OFFLINE" ? "OFFLINE" : "ONLINE"}"]`).checked = true;
    hide("saveErr"); hide("saveOk");
  }

  async function refreshAdmin() {
    const r = await api("/api/admin-config");
    if (r.status === 401) { adminLost(); hide("panel"); openLogin(); return; }
    if (r.ok) { adminGained(); adminCfg = r.data; fillForm(r.data); }
  }

  function openPanel() {
    if (!adminHint) return openLogin();
    if (adminCfg) fillForm(adminCfg);
    show("panel");
    refreshAdmin();
  }

  async function doLogin(e) {
    e.preventDefault();
    const btn = $("loginForm").querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "กำลังตรวจสอบ...";
    const r = await api("/api/login", "POST", { password: $("pass").value, remember: $("remember").checked });
    $("pass").value = "";
    btn.disabled = false; btn.textContent = "ยืนยันเข้าสู่ระบบ";
    if (r.ok) { adminGained(); hide("login"); openPanel(); return; }
    const msg = r.status === 429 ? "ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาที"
      : r.status === 500 ? "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า ADMIN_PASSWORD / SESSION_SECRET"
      : "รหัสผ่านไม่ถูกต้อง";
    $("loginErr").textContent = msg; show("loginErr");
  }

  async function saveForm(e) {
    e.preventDefault();
    hide("saveErr"); hide("saveOk");
    const btn = $("adminForm").querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "⏳ กำลังบันทึก...";
    const r = await api("/api/admin-config", "PUT", {
      status: document.querySelector('input[name="status"]:checked').value,
      fileUrl: $("fUrl").value, title: $("fTitle").value, fileSize: $("fSize").value,
      version: $("fVer").value, maintenanceMsg: $("fMsg").value, cooldownSec: $("fCool").value,
    });
    btn.disabled = false; btn.textContent = "💾 บันทึก";
    if (r.status === 401) { adminLost(); hide("panel"); return openLogin(); }
    if (!r.ok) { $("saveErr").textContent = r.data.error || "บันทึกไม่สำเร็จ"; show("saveErr"); return; }
    adminCfg = r.data;
    show("saveOk");
    loadConfig();
  }

  /* ---------- แก้ความต้องการระบบ (หน้าต่างแยกจากแผงหลัก) ---------- */
  function openSpecs() {
    if (!adminHint) return openLogin();
    fillSpecInputs(adminCfg && adminCfg.specs);
    hide("specErr"); hide("specOk");
    show("specsEdit");
  }

  async function saveSpecs(e) {
    e.preventDefault();
    hide("specErr"); hide("specOk");
    const btn = $("specForm").querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "⏳ กำลังบันทึก...";
    let base = adminCfg;
    if (!base) { const g = await api("/api/admin-config"); if (g.ok) base = adminCfg = g.data; }
    let r = { ok: false, status: 0, data: {} };
    if (base) r = await api("/api/admin-config", "PUT", { ...base, specs: readSpecInputs() });
    btn.disabled = false; btn.textContent = "💾 บันทึก";
    if (r.status === 401) { adminLost(); hide("specsEdit"); hide("panel"); return openLogin(); }
    if (!r.ok) { $("specErr").textContent = r.data.error || "บันทึกไม่สำเร็จ"; show("specErr"); return; }
    adminCfg = r.data;
    show("specOk");
    loadConfig();
  }

  /* ---------- ประวัติดาวน์โหลด (แสดงด้วย textContent เท่านั้น กัน XSS จาก User-Agent) ---------- */
  let logLimit = 100;
  // แยกระบบปฏิบัติการ (Windows / Android / ...) กับเบราว์เซอร์ (Chrome / Edge / ...) ออกจากกัน
  // ลำดับการตรวจสำคัญ: เบราว์เซอร์อื่นหลายตัวมีคำว่า Chrome/ ใน User-Agent ต้องเช็คตัวเฉพาะก่อน Chrome
  const uaOS = (ua) =>
    /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /CrOS/.test(ua) ? "ChromeOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux|X11/.test(ua) ? "Linux" : "อื่น ๆ";
  const uaBrowser = (ua) =>
    /EdgiOS|EdgA|Edg\//.test(ua) ? "Edge"
    : /OPR\/|OPiOS|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /UCBrowser|UCWEB/.test(ua) ? "UC Browser"
    : /Vivaldi/.test(ua) ? "Vivaldi"
    : /YaBrowser/.test(ua) ? "Yandex"
    : /FBAN|FBAV|FB_IAB/.test(ua) ? "Facebook (ในแอป)"
    : /Instagram/.test(ua) ? "Instagram (ในแอป)"
    : /\bLine\//.test(ua) ? "LINE (ในแอป)"
    : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
    : /Chrome\/|CriOS/.test(ua) ? "Google Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "อื่น ๆ";
  const fmtTime = (t) => new Date(t).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium" });

  const fmtBytes = (n) => {
    if (!Number.isFinite(n)) return "-";
    const u = ["ไบต์", "KB", "MB", "GB", "TB"]; let v = n, i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (i ? v.toFixed(2) : String(v)) + " " + u[i] + (i ? ` (${n.toLocaleString("en-US")} ไบต์)` : "");
  };
  // ป้ายสั้นสำหรับคอลัมน์ Google Drive (รายละเอียดเต็มดูที่แถวขยายด้านล่าง)
  const DRIVE_SHORT = {
    ok: "พร้อมโหลด", bad_url: "ลิงก์ไม่ถูกต้อง", folder: "เป็นโฟลเดอร์", google_native: "ไม่ใช่ไฟล์ให้โหลด", not_found: "ไม่พบไฟล์",
    trashed: "อยู่ในถังขยะ", no_permission: "ไม่ได้แชร์", quota_exceeded: "โควต้าเต็ม", rate_limited: "ถูกจำกัดความถี่",
    drive_error: "Drive ขัดข้อง", virus_scan: "หน้าเตือนไวรัส", html_unknown: "ตอบเป็นหน้าเว็บ", empty_file: "ไฟล์ 0 ไบต์",
    size_conflict: "ขนาดไม่ตรง", timeout: "Drive ตอบช้า", network: "เชื่อมต่อไม่ได้",
  };
  const VERIFY_SHORT = {
    ok: "ไฟล์สมบูรณ์", ok_size_only: "ขนาดตรง (ไม่มี MD5)", corrupt_size: "ไฟล์เสีย (ขนาดไม่ตรง)", corrupt_md5: "ไฟล์เสีย (MD5 ไม่ตรง)",
    unverifiable: "ตรวจไม่ได้", drive_unavailable: "ตรวจไม่ได้ (Drive มีปัญหา)",
  };
  const sevIcon = (sev) => sev === "ok" ? "✅ " : sev === "warn" ? "⚠ " : "❌ ";
  const sevCls = (sev) => "tag " + (sev === "ok" ? "ok" : sev === "warn" ? "warn" : "bad");
  const isProblem = (e) => !!((e.drive && e.drive.sev !== "ok") || (e.verify && e.verify.level !== "ok"));

  const driveCell = (e) => e.drive
    ? { text: sevIcon(e.drive.sev) + (DRIVE_SHORT[e.drive.code] || e.drive.title), cls: sevCls(e.drive.sev), title: e.drive.title }
    : { text: "- (ไม่ได้ตรวจ)", title: "รายการนี้บันทึกก่อนเปิดระบบตรวจ Google Drive" };
  const verifyCell = (e) => e.verify
    ? { text: sevIcon(e.verify.level) + (VERIFY_SHORT[e.verify.status] || e.verify.title), cls: sevCls(e.verify.level), title: e.verify.title }
    : e.clicked ? { text: "⏳ ผู้ใช้ยังไม่ได้ตรวจไฟล์", cls: "tag wait", title: "เว็บรู้ไม่ได้เองว่าโหลดจบหรือไฟล์เสียหรือไม่ จนกว่าผู้ใช้จะกดตรวจไฟล์" } : { text: "-" };

  // บรรทัดรายละเอียดของผลตรวจ Google Drive (ใช้ทั้งในแถวขยายและกล่อง "ตรวจตอนนี้")
  function driveLines(d) {
    const out = [];
    if (d.hint) out.push(["วิธีแก้", d.hint]);
    if (d.detail) out.push(["รายละเอียด", d.detail]);
    out.push(["ข้อมูลทางเทคนิค", `HTTP ${d.http || "-"} · Drive API ${d.apiHttp || "-"} · ใช้เวลา ${d.ms ?? "-"} ms · ตรวจเมื่อ ${d.checkedAt ? fmtTime(d.checkedAt) : "-"}`]);
    out.push(["ไฟล์บน Drive", `${d.name ? `"${d.name}" · ` : ""}ขนาด ${d.size != null ? fmtBytes(d.size) : "ไม่ทราบ"} · MD5 ${d.md5 || "ไม่มี (ตั้ง GOOGLE_API_KEY เพื่อให้ตรวจเนื้อไฟล์ได้)"}`]);
    return out;
  }

  function line(box, label, text) {
    const d = document.createElement("div"); d.className = "dline";
    const b = document.createElement("b"); b.textContent = label + ": ";
    d.append(b, document.createTextNode(text));
    box.appendChild(d);
  }

  function detailRow(e) {
    const tr = document.createElement("tr"); tr.className = "detail";
    const cell = document.createElement("td"); cell.colSpan = 9; tr.appendChild(cell);
    // กล่องข้อความตรึงซ้าย กว้างเท่าหน้าต่างที่มองเห็น ไม่ยืดไปตามความกว้างของตารางที่เลื่อนได้
    const td = document.createElement("div"); td.className = "dwrap"; cell.appendChild(td);
    line(td, "ผู้ใช้", `${e.ip || "-"} · ${[e.country, e.city].filter(Boolean).join(" · ") || "ไม่ทราบที่ตั้ง"} · ${e.ua ? uaOS(e.ua) + " / " + uaBrowser(e.ua) : "ไม่ทราบอุปกรณ์"} · เวอร์ชัน ${e.ver || "-"}`);
    if (e.ua) line(td, "User-Agent", e.ua);
    line(td, "การดาวน์โหลด", `ขอลิงก์เมื่อ ${fmtTime(e.t)} · ` + (e.clicked ? `กดดาวน์โหลดเมื่อ ${e.clickedAt ? fmtTime(e.clickedAt) : "-"}` : "ยังไม่ได้กดปุ่มดาวน์โหลด"));
    if (e.drive) {
      line(td, "Google Drive ตอนส่งลิงก์", sevIcon(e.drive.sev) + e.drive.title);
      for (const [k, v] of driveLines(e.drive)) line(td, "　" + k, v);
    } else line(td, "Google Drive", "ไม่ได้ตรวจ (รายการนี้บันทึกก่อนเปิดระบบตรวจ Drive หรือตรวจไม่สำเร็จตอนนั้น)");
    if (e.verify) {
      const v = e.verify;
      line(td, "ไฟล์ที่ผู้ใช้โหลดมา", sevIcon(v.level) + v.title);
      if (v.detail) line(td, "　รายละเอียด", v.detail);
      line(td, "　ไฟล์ที่ผู้ใช้เลือก", `${v.name ? `"${v.name}" · ` : ""}ขนาด ${fmtBytes(v.size)} · MD5 ${v.md5 || "ไม่ได้คำนวณ"} · ตรวจเมื่อ ${fmtTime(v.at)}`);
    } else if (e.clicked) line(td, "ไฟล์ที่ผู้ใช้โหลดมา", "ผู้ใช้ยังไม่ได้กดตรวจไฟล์ (เว็บรู้ไม่ได้เองว่าเบราว์เซอร์โหลดจบหรือไฟล์เสียหรือไม่)");
    return tr;
  }

  async function checkDriveNow() {
    const box = $("driveNow"), btn = $("logCheck");
    btn.disabled = true; box.className = "vres"; $("dnTitle").textContent = "กำลังตรวจ Google Drive..."; $("dnDetail").textContent = ""; box.hidden = false;
    const r = await api("/api/admin-log?check=1");
    btn.disabled = false;
    if (r.status === 401) { adminLost(); hide("logs"); hide("panel"); return openLogin(); }
    if (!r.ok || !r.data.drive) { box.className = "vres error"; $("dnTitle").textContent = "ตรวจ Google Drive ไม่สำเร็จ"; $("dnDetail").textContent = "เซิร์ฟเวอร์ตรวจไม่ได้ ลองใหม่อีกครั้ง"; return; }
    const d = r.data.drive;
    box.className = "vres " + (d.sev === "ok" ? "ok" : d.sev === "warn" ? "warn" : "error");
    $("dnTitle").textContent = "ลิงก์ดาวน์โหลดปัจจุบัน: " + sevIcon(d.sev) + d.title;
    $("dnDetail").textContent = driveLines(d).map(([k, v]) => `${k}: ${v}`).join("\n");
  }

  function logRow(cells, cls) {
    const tr = document.createElement("tr");
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c.text;
      if (c.title) td.title = c.title;
      if (c.cls) td.className = c.cls;
      if (cls === "empty") { td.className = "empty"; td.colSpan = 9; }
      tr.appendChild(td);
    }
    return tr;
  }

  async function loadLogs() {
    $("logRefresh").disabled = true;
    const r = await api("/api/admin-log?limit=" + logLimit);
    $("logRefresh").disabled = false;
    if (r.status === 401) { adminLost(); hide("logs"); hide("panel"); return openLogin(); }
    const body = $("logBody"); body.replaceChildren();
    if (!r.ok) { $("logErr").textContent = "โหลดประวัติไม่สำเร็จ"; show("logErr"); return; }
    hide("logErr");
    const { total, last24, items } = r.data;
    const bad = items.filter(isProblem).length;
    $("logSum").textContent = `ทั้งหมด ${total} ครั้ง · 24 ชั่วโมงล่าสุด ${last24} ครั้ง · เก็บย้อนหลัง 90 วัน` + (bad ? ` · ⚠ พบปัญหา ${bad} รายการ (ในที่แสดงอยู่)` : "") +
      ` — ผลตรวจ Google Drive บันทึกตอนส่งลิงก์ ส่วนผลตรวจไฟล์ที่โหลดมาจะขึ้นเมื่อผู้ใช้กดตรวจไฟล์ในหน้าเว็บ (เว็บรู้เองไม่ได้ว่าโหลดจบหรือไม่) · คลิกแถวเพื่อดูรายละเอียด`;
    if (!items.length) body.appendChild(logRow([{ text: "ยังไม่มีผู้ดาวน์โหลด" }], "empty"));
    for (const e of items) {
      const main = logRow([
        { text: fmtTime(e.t) }, { text: e.ip || "-" },
        { text: [e.country, e.city].filter(Boolean).join(" · ") || "-" },
        { text: e.ua ? uaOS(e.ua) : "-", title: e.ua || "" },
        { text: e.ua ? uaBrowser(e.ua) : "-", title: e.ua || "" },
        { text: e.ver || "-" },
        e.clicked ? { text: "✅ กดดาวน์โหลดแล้ว", cls: "tag ok" } : { text: "⏳ ขอลิงก์ (ยังไม่กดโหลด)", cls: "tag wait" },
        driveCell(e), verifyCell(e),
      ]);
      main.classList.add("lrow");
      const det = detailRow(e);
      det.hidden = !isProblem(e); // รายการที่มีปัญหาขยายรายละเอียดให้เห็นเลย รายการปกติคลิกเพื่อดู
      main.addEventListener("click", () => { det.hidden = !det.hidden; });
      body.append(main, det);
    }
    $("logMore").hidden = items.length >= total;
  }

  function openLogs() {
    logLimit = 100;
    $("logBody").replaceChildren(logRow([{ text: "กำลังโหลด..." }], "empty"));
    $("logSum").textContent = ""; hide("logErr"); hide("driveNow"); $("logMore").hidden = true;
    show("logs"); loadLogs();
  }

  async function clearLogsAll() {
    if (!window.confirm("ล้างประวัติการดาวน์โหลดทั้งหมด? ย้อนกลับไม่ได้")) return;
    const r = await api("/api/admin-log", "DELETE", {});
    if (r.ok) loadLogs(); else { $("logErr").textContent = "ล้างประวัติไม่สำเร็จ"; show("logErr"); }
  }

  /* ---------- แอดมิน: อัปโหลด/ลบรูปหน้าปกและพื้นหลัง ---------- */
  // ย่อรูปในเครื่องก่อนส่ง (ด้านยาวสุดไม่เกินค่าที่กำหนด แล้วบันทึกเป็น JPEG) ผู้ใช้เลือกรูปจากมือถือ/กล้องขนาดหลายสิบ MB ได้เลย
  // ได้ไฟล์เล็กพอสำหรับเพดาน 4 MB ของเซิร์ฟเวอร์ และตัดข้อมูลแปลกปลอมในไฟล์ (EXIF/GPS) ทิ้งไปด้วย
  const IMG_SLOTS = { cover: { Name: "Cover", max: 1600 }, bg: { Name: "Bg", max: 2560 } };
  const IMG_LIMIT = 3.6 * 1024 * 1024; // เหลือส่วนต่างจากเพดานเซิร์ฟเวอร์ 4 MB
  const fmtKB = (n) => (n >= 1048576 ? (n / 1048576).toFixed(2) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

  async function decodeImage(file) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {}
    try { return await createImageBitmap(file); } catch {}
    // เบราว์เซอร์เก่า: อ่านผ่าน data: URL (CSP อนุญาต data: แต่ไม่อนุญาต blob:)
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    return await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
  }

  async function prepareImage(file, maxSide) {
    // SVG เป็นภาพเวกเตอร์ ไม่มีขนาดพิกเซลแน่นอน วาดลงแคนวาสแล้วจะได้รูปเล็กเบลอ จึงไม่รับ (ให้ใช้ JPG/PNG/WebP)
    if (file.type === "image/svg+xml" || /\.svgz?$/i.test(file.name)) throw new Error("svg");
    const src = await decodeImage(file);
    const w0 = src.width, h0 = src.height;
    if (!w0 || !h0) throw new Error("decode");
    const k = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const g = cv.getContext("2d");
    g.fillStyle = "#0a0d08"; g.fillRect(0, 0, w, h); // PNG โปร่งใสจะวางบนสีพื้นเข้มของเว็บ
    g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    for (const q of [0.86, 0.74, 0.62, 0.5, 0.4]) {
      const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= IMG_LIMIT) return { blob, w, h };
    }
    throw new Error("too_large");
  }

  function slotMsg(slot, level, text) {
    const box = $("msg" + IMG_SLOTS[slot].Name);
    box.className = "vres " + (level || "");
    box.firstElementChild.textContent = text || "";
    box.hidden = !text;
  }
  function slotBusy(slot, on) {
    const n = IMG_SLOTS[slot].Name;
    $("up" + n).disabled = on; $("del" + n).disabled = on || !(cfg && cfg.img && cfg.img[slot]);
  }
  function renderImagePrev() {
    for (const slot of Object.keys(IMG_SLOTS)) {
      const n = IMG_SLOTS[slot].Name, v = cfg && cfg.img && cfg.img[slot];
      const src = imgUrl(slot, v) || (slot === "cover" ? COVER_DEFAULT : "");
      const im = $("prev" + n);
      if (src) { if (im.getAttribute("src") !== src) im.src = src; im.hidden = false; } else { im.removeAttribute("src"); im.hidden = true; }
      $("empty" + n).hidden = !!src;
      $("del" + n).disabled = !v;
    }
  }
  function openImages() {
    if (!adminHint) return openLogin();
    for (const slot of Object.keys(IMG_SLOTS)) slotMsg(slot, "", "");
    renderImagePrev(); show("images");
  }

  async function sendImage(slot, method, blob) {
    try {
      const res = await fetch("/api/admin-image?slot=" + slot, {
        method, cache: "no-store", credentials: "same-origin",
        headers: blob ? { "content-type": blob.type || "image/jpeg" } : {}, body: blob || undefined,
      });
      let data = null; try { data = await res.json(); } catch {}
      return { ok: res.ok, status: res.status, data: data || {} };
    } catch { return { ok: false, status: 0, data: {} }; }
  }
  const imgErr = (r) => r.status === 0 ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่"
    : r.status === 413 ? "รูปใหญ่เกินที่เซิร์ฟเวอร์รับได้ (4 MB) ลองรูปที่เล็กลง"
    : r.status === 415 ? "ชนิดไฟล์ไม่รองรับ (รับเฉพาะ JPEG / PNG / WebP)"
    : r.status === 429 ? "อัปโหลดบ่อยเกินไป กรุณารอสักครู่"
    : r.status === 403 ? "คำขอถูกปฏิเสธ (ตรวจว่าเปิดเว็บจากที่อยู่เดียวกับที่ล็อกอิน)"
    : "อัปโหลดไม่สำเร็จ (" + (r.data.error || "HTTP " + r.status) + ")";
  function imgApplied(img) {
    cfg = { ...cfg, img }; render(); renderImagePrev();
    if (bc) bc.postMessage({ cfg });
  }
  function imgSessionLost() { adminLost(); hide("images"); hide("panel"); openLogin(); }

  async function uploadImage(slot, file) {
    if (!file) return;
    slotBusy(slot, true); slotMsg(slot, "warn", "กำลังประมวลผลรูป...");
    let prep;
    try { prep = await prepareImage(file, IMG_SLOTS[slot].max); }
    catch (e) {
      slotBusy(slot, false);
      slotMsg(slot, "error", e.message === "too_large" ? "รูปนี้ยังใหญ่เกินไปแม้บีบอัดสุดแล้ว ลองรูปอื่นหรือรูปที่เล็กลง"
        : e.message === "svg" ? "ไม่รองรับไฟล์ SVG กรุณาใช้รูป JPG, PNG หรือ WebP"
        : "เปิดรูปนี้ไม่ได้ (ไม่ใช่ไฟล์รูปภาพ หรือไฟล์เสียหาย)");
      return;
    }
    slotMsg(slot, "warn", `กำลังอัปโหลด ${prep.w}×${prep.h} (${fmtKB(prep.blob.size)})...`);
    const r = await sendImage(slot, "PUT", prep.blob);
    slotBusy(slot, false);
    if (r.status === 401) return imgSessionLost();
    if (!r.ok) { slotMsg(slot, "error", imgErr(r)); return; }
    imgApplied(r.data.img);
    slotMsg(slot, "ok", `อัปโหลดแล้ว ${prep.w}×${prep.h} · ${fmtKB(prep.blob.size)} รูปบนเว็บเปลี่ยนเรียบร้อย`);
  }

  async function removeImage(slot) {
    if (!window.confirm(slot === "cover" ? "กลับไปใช้รูปเริ่มต้นของกรอบหน้าปก?" : "ลบรูปพื้นหลัง? (จะกลับเป็นพื้นหลังสีเข้มปกติ)")) return;
    slotBusy(slot, true); slotMsg(slot, "warn", "กำลังลบ...");
    const r = await sendImage(slot, "DELETE");
    slotBusy(slot, false);
    if (r.status === 401) return imgSessionLost();
    if (!r.ok) { slotMsg(slot, "error", imgErr(r)); return; }
    imgApplied(r.data.img);
    slotMsg(slot, "ok", slot === "cover" ? "กลับเป็นรูปเริ่มต้นแล้ว" : "ลบรูปพื้นหลังแล้ว");
  }

  function logout() { adminLost(); hide("logs"); hide("images"); hide("specsEdit"); hide("panel"); api("/api/logout", "POST", {}); }

  // เครื่องที่เคยล็อกอินแอดมิน: โชว์เฟืองทันที (กันกระพริบ) แล้วถามเซิร์ฟเวอร์ว่าเซสชันยังใช้ได้ไหม
  // ถ้าเซิร์ฟเวอร์บอกว่าไม่ใช่แอดมินแล้ว (หมดอายุ/ออกจากระบบ/เปลี่ยนรหัสผ่านแล้ว) ก็ซ่อนเฟืองและลืมเครื่องนี้
  // ถ้าติดต่อเซิร์ฟเวอร์ไม่ได้ (ออฟไลน์) ยังคงสถานะเดิมไว้ ไม่ถือว่าหลุด
  async function refreshAdminQuiet() {
    if (!hasHint()) return;
    showAdminUi(true);
    const r = await api("/api/session");
    if (r.ok && r.data.admin) adminGained();
    else if (r.ok) adminLost();
  }

  // ทางเข้าลับ: เปิดเว็บด้วย /#admin (เครื่องที่จำไว้แล้วเข้าแผงได้เลย เครื่องใหม่ขึ้นหน้ากรอกรหัส)
  async function handleAdminHash() {
    if (location.hash !== "#admin") return;
    history.replaceState(null, "", location.pathname + location.search); // ไม่ทิ้ง #admin ไว้ใน URL
    const r = await api("/api/session");
    if (r.ok && r.data.admin) { adminGained(); openPanel(); } else openLogin();
  }

  /* ---------- เมาส์ + พื้นหลัง ---------- */
  function initFx() {
    const cur = $("cursor"), dot = $("cursorDot");
    let mx = 0, my = 0, tgt = null, queued = false;
    addEventListener("mousemove", (e) => {
      mx = e.clientX; my = e.clientY; tgt = e.target;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        document.body.classList.add("mouse");
        cur.style.left = dot.style.left = mx + "px";
        cur.style.top = dot.style.top = my + "px";
        cur.classList.toggle("hot", !!(tgt && tgt.closest && tgt.closest("button, label")));
      });
    }, { passive: true });
    addEventListener("click", (e) => {
      const r = document.createElement("div");
      r.className = "ripple"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
      document.body.appendChild(r); setTimeout(() => r.remove(), 500);
    });

    const cv = $("bg"), ctx = cv.getContext("2d");
    let w = (cv.width = innerWidth), h = (cv.height = innerHeight);
    // มือถือ: แถบ URL ขึ้น/ลงทำให้ความสูงเปลี่ยนรัว ๆ จึงปรับขนาดเฉพาะตอนความกว้างเปลี่ยน (หมุนจอ) ไม่ล้างภาพทุกครั้ง
    addEventListener("resize", () => { if (innerWidth !== w) { w = cv.width = innerWidth; h = cv.height = innerHeight; } });
    const coarse = matchMedia("(pointer: coarse)").matches; // จอสัมผัส: ลดจำนวนจุดเพื่อประหยัดแบต
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ps = Array.from({ length: Math.min(Math.floor(w / 40), coarse ? 12 : 28) }, () => ({
      x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 2 + 1, c: Math.random() > 0.5 ? "#65a30d" : "#facc15", a: Math.random() * 0.5 + 0.2,
    }));
    (function loop() {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        if (!still) { p.x += p.vx; p.y += p.vy; }
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.globalAlpha = p.a; ctx.fillStyle = p.c; ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!still) requestAnimationFrame(loop);
    })();
  }

  /* ---------- เชื่อมปุ่ม (ไม่ใช้ onclick ใน HTML เพื่อให้ CSP เข้มงวดได้) ---------- */
  $("dlBtn").addEventListener("click", startDownload);
  $("popCancel").addEventListener("click", closePopup);
  $("gearBtn").addEventListener("click", openPanel);
  $("footAdmin").addEventListener("click", openPanel);
  $("loginForm").addEventListener("submit", doLogin);
  $("adminForm").addEventListener("submit", saveForm);
  $("logoutBtn").addEventListener("click", logout);
  $("logBtn").addEventListener("click", openLogs);
  $("imgBtn").addEventListener("click", openImages);
  for (const slot of Object.keys(IMG_SLOTS)) {
    const n = IMG_SLOTS[slot].Name;
    $("up" + n).addEventListener("click", () => $("file" + n).click());
    $("file" + n).addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; uploadImage(slot, f); });
    $("del" + n).addEventListener("click", () => removeImage(slot));
  }
  $("specBtn").addEventListener("click", openSpecs);
  $("specForm").addEventListener("submit", saveSpecs);
  $("logRefresh").addEventListener("click", loadLogs);
  $("logCheck").addEventListener("click", checkDriveNow);
  $("verifyBtn").addEventListener("click", openVerify);
  $("vGo").addEventListener("click", runVerify);
  $("vSkip").addEventListener("click", () => { vSkipMd5 = true; });
  $("logMore").addEventListener("click", () => { logLimit += 100; loadLogs(); });
  $("logClear").addEventListener("click", clearLogsAll);
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => hide(b.dataset.close)));
  // คลิกที่ว่างนอกกล่อง (พื้นหลังมืด) ของหน้าต่างแอดมินแล้วปิดทันที ไม่ต้องกดกากบาท
  // ต้องกดลงและปล่อยที่พื้นหลังทั้งคู่ จึงไม่ปิดเองตอนลากเมาส์เลือกข้อความแล้วปล่อยนอกกล่อง
  for (const id of ["login", "panel", "specsEdit", "logs", "images"]) {
    const m = $(id); let down = false;
    m.addEventListener("pointerdown", (e) => { down = e.target === m; });
    m.addEventListener("click", (e) => { if (down && e.target === m) hide(id); down = false; });
  }
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePopup(); hide("verify"); hide("login"); hide("logs"); hide("images"); hide("specsEdit"); hide("panel"); }
  });

  // เรียลไทม์: ดึงสถานะล่าสุดทุก 4 วินาที (เฉพาะตอนเปิดหน้าอยู่) และทันทีที่กลับมาที่แท็บ
  let polling = false;
  async function poll() {
    if (document.hidden || polling || saving) return;
    polling = true;
    const r = await api("/api/config");
    polling = false;
    if (r.ok && !saving && JSON.stringify(r.data) !== JSON.stringify(cfg)) { cfg = r.data; render(); }
  }
  setInterval(poll, 4000);
  document.addEventListener("visibilitychange", poll);
  addEventListener("focus", poll);
  // แท็บอื่นในเบราว์เซอร์เดียวกันอัปเดตทันที
  if (bc) bc.onmessage = (e) => { if (e.data && e.data.cfg) { cfg = e.data.cfg; render(); } };

  addEventListener("hashchange", handleAdminHash);
  loadConfig();
  initFx();
  handleAdminHash();
  // อุ่นเครื่องฟังก์ชันดาวน์โหลดล่วงหน้า ลดอาการหน่วงตอนกดครั้งแรก (ตอบ 405 ทันที ไม่แตะข้อมูลใด ๆ)
  (window.requestIdleCallback || setTimeout)(() => {
    fetch("/api/download", { method: "GET", cache: "no-store" }).catch(() => {});
    refreshAdminQuiet();
  });
})();
