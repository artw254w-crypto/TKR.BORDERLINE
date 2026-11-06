"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  // โหลดฟอนต์แบบไม่บล็อกการแสดงผล (หน้าเว็บขึ้นทันที แล้วฟอนต์ค่อยสลับเข้ามา)
  { const l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Prompt:wght@300;400;600;700&display=swap";
    document.head.appendChild(l); }
  let cfg = null, timer = null, popupRun = 0, saving = false;
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

  // ใช้ textContent ทั้งหมด ไม่มี innerHTML กับข้อมูลที่มาจากผู้ใช้/เซิร์ฟเวอร์ (กัน XSS)
  function render() {
    if (!cfg) return;
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

  /* ---------- Admin (เปิดหน้าต่างทันที แล้วค่อยโหลดข้อมูลเบื้องหลัง) ---------- */
  let adminHint = false, adminCfg = null;

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
    if (r.status === 401) { adminHint = false; adminCfg = null; hide("panel"); openLogin(); return; }
    if (r.ok) { adminHint = true; adminCfg = r.data; fillForm(r.data); }
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
    const r = await api("/api/login", "POST", { password: $("pass").value });
    $("pass").value = "";
    btn.disabled = false; btn.textContent = "ยืนยันเข้าสู่ระบบ";
    if (r.ok) { adminHint = true; hide("login"); openPanel(); return; }
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
    if (r.status === 401) { adminHint = false; hide("panel"); return openLogin(); }
    if (!r.ok) { $("saveErr").textContent = r.data.error || "บันทึกไม่สำเร็จ"; show("saveErr"); return; }
    adminCfg = r.data;
    show("saveOk");
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

  function logRow(cells, cls) {
    const tr = document.createElement("tr");
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c.text;
      if (c.title) td.title = c.title;
      if (c.cls) td.className = c.cls;
      if (cls === "empty") { td.className = "empty"; td.colSpan = 7; }
      tr.appendChild(td);
    }
    return tr;
  }

  async function loadLogs() {
    $("logRefresh").disabled = true;
    const r = await api("/api/admin-log?limit=" + logLimit);
    $("logRefresh").disabled = false;
    if (r.status === 401) { adminHint = false; adminCfg = null; hide("logs"); hide("panel"); return openLogin(); }
    const body = $("logBody"); body.replaceChildren();
    if (!r.ok) { $("logErr").textContent = "โหลดประวัติไม่สำเร็จ"; show("logErr"); return; }
    hide("logErr");
    const { total, last24, items } = r.data;
    $("logSum").textContent = `ทั้งหมด ${total} ครั้ง · 24 ชั่วโมงล่าสุด ${last24} ครั้ง · เก็บย้อนหลัง 90 วัน (บันทึกตอนระบบส่งลิงก์ให้ ไม่ได้ยืนยันว่าโหลดไฟล์จบ)`;
    if (!items.length) body.appendChild(logRow([{ text: "ยังไม่มีผู้ดาวน์โหลด" }], "empty"));
    for (const e of items) {
      body.appendChild(logRow([
        { text: fmtTime(e.t) }, { text: e.ip || "-" },
        { text: [e.country, e.city].filter(Boolean).join(" · ") || "-" },
        { text: e.ua ? uaOS(e.ua) : "-", title: e.ua || "" },
        { text: e.ua ? uaBrowser(e.ua) : "-", title: e.ua || "" },
        { text: e.ver || "-" },
        e.clicked ? { text: "✅ กดดาวน์โหลดแล้ว", cls: "tag ok" } : { text: "⏳ ขอลิงก์ (ยังไม่กดโหลด)", cls: "tag wait" },
      ]));
    }
    $("logMore").hidden = items.length >= total;
  }

  function openLogs() {
    logLimit = 100;
    $("logBody").replaceChildren(logRow([{ text: "กำลังโหลด..." }], "empty"));
    $("logSum").textContent = ""; hide("logErr"); $("logMore").hidden = true;
    show("logs"); loadLogs();
  }

  async function clearLogsAll() {
    if (!window.confirm("ล้างประวัติการดาวน์โหลดทั้งหมด? ย้อนกลับไม่ได้")) return;
    const r = await api("/api/admin-log", "DELETE", {});
    if (r.ok) loadLogs(); else { $("logErr").textContent = "ล้างประวัติไม่สำเร็จ"; show("logErr"); }
  }

  function logout() { adminHint = false; adminCfg = null; hide("logs"); hide("panel"); api("/api/logout", "POST", {}); }

  // เช็กเงียบ ๆ ว่ามีเซสชันแอดมินอยู่แล้วไหม (เพื่อให้กดเฟืองแล้วเข้าแผงได้ทันที)
  async function refreshAdminQuiet() {
    const r = await api("/api/admin-config");
    if (r.ok) { adminHint = true; adminCfg = r.data; }
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
    addEventListener("resize", () => { w = cv.width = innerWidth; h = cv.height = innerHeight; });
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ps = Array.from({ length: Math.min(Math.floor(w / 40), 28) }, () => ({
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
  $("logRefresh").addEventListener("click", loadLogs);
  $("logMore").addEventListener("click", () => { logLimit += 100; loadLogs(); });
  $("logClear").addEventListener("click", clearLogsAll);
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => hide(b.dataset.close)));
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePopup(); hide("login"); hide("logs"); hide("panel"); }
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

  loadConfig();
  initFx();
  // อุ่นเครื่องฟังก์ชันดาวน์โหลดล่วงหน้า ลดอาการหน่วงตอนกดครั้งแรก (ตอบ 405 ทันที ไม่แตะข้อมูลใด ๆ)
  (window.requestIdleCallback || setTimeout)(() => {
    fetch("/api/download", { method: "GET", cache: "no-store" }).catch(() => {});
    refreshAdminQuiet();
  });
})();
