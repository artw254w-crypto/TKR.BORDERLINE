"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  let cfg = null, timer = null, popupRun = 0;

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
    if (r.ok) { cfg = r.data; render(); }
    else {
      $("title").textContent = "T.R.K : BORDER LINE";
      $("noticeDesc").textContent = "โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้านี้";
    }
  }

  /* ---------- ดาวน์โหลด (เซิร์ฟเวอร์ตรวจเวลาคูลดาวน์) ---------- */
  function closePopup() { popupRun++; clearInterval(timer); hide("popup"); }

  async function startDownload() {
    if (!cfg || cfg.status !== "ONLINE") return;
    const run = ++popupRun;
    clearInterval(timer);
    const go = $("popGo");
    go.disabled = true; go.onclick = null; go.textContent = "⏳ กำลังเตรียม...";
    $("popMsg").textContent = "ระบบกำลังเตรียมลิงก์ดาวน์โหลดให้ รอสักครู่นะ";
    $("count").textContent = "…";
    $("prog").style.width = "100%";
    show("popup");

    const s = await api("/api/download", "POST", { action: "start" });
    if (run !== popupRun) return;
    if (!s.ok) {
      $("count").textContent = "✖";
      $("popMsg").textContent = s.status === 429 ? "คุณกดบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่"
        : s.status === 503 ? "ระบบปิดปรับปรุงอยู่ในขณะนี้" : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
      return;
    }
    const total = s.data.wait, token = s.data.token;
    let left = total;
    $("count").textContent = left;
    go.textContent = `⏳ กำลังเตรียมไฟล์ (${left}s)...`;
    requestAnimationFrame(() => { $("prog").style.width = ((left - 1) / total) * 100 + "%"; });

    timer = setInterval(async () => {
      left--;
      if (left > 0) {
        $("count").textContent = left;
        $("prog").style.width = ((left - 1) / total) * 100 + "%";
        go.textContent = `⏳ กำลังเตรียมไฟล์ (${left}s)...`;
        return;
      }
      clearInterval(timer);
      $("count").textContent = "✨";
      go.disabled = false;
      go.textContent = "🚀 เริ่มดาวน์โหลด!";
      go.onclick = async () => {
        go.disabled = true;
        // เผื่อเวลานาฬิกาเบราว์เซอร์/เครือข่ายเหลื่อมกันเล็กน้อย
        let r = await api("/api/download", "POST", { action: "redeem", token });
        if (r.status === 403) { await new Promise((x) => setTimeout(x, 1500)); r = await api("/api/download", "POST", { action: "redeem", token }); }
        if (r.ok && typeof r.data.url === "string" && r.data.url.startsWith("https://")) {
          closePopup();
          window.location.href = r.data.url;
        } else {
          $("popMsg").textContent = "ขอลิงก์ไม่สำเร็จ กรุณากดยกเลิกแล้วลองใหม่";
        }
      };
    }, 1000);
  }

  /* ---------- Admin ---------- */
  function openLogin() {
    $("pass").value = ""; hide("loginErr"); show("login");
    setTimeout(() => $("pass").focus(), 50);
  }

  function fillForm(c) {
    $("fUrl").value = c.fileUrl; $("fTitle").value = c.title; $("fSize").value = c.fileSize;
    $("fVer").value = c.version; $("fMsg").value = c.maintenanceMsg; $("fCool").value = c.cooldownSec;
    document.querySelector(`input[name="status"][value="${c.status === "OFFLINE" ? "OFFLINE" : "ONLINE"}"]`).checked = true;
    hide("saveErr"); hide("saveOk");
  }

  async function openPanel() {
    const r = await api("/api/admin-config");
    if (r.status === 401) return openLogin();
    if (!r.ok) return;
    fillForm(r.data); show("panel");
  }

  async function doLogin(e) {
    e.preventDefault();
    const r = await api("/api/login", "POST", { password: $("pass").value });
    $("pass").value = "";
    if (r.ok) { hide("login"); openPanel(); return; }
    const msg = r.status === 429 ? "ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาที"
      : r.status === 500 ? "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า ADMIN_PASSWORD / SESSION_SECRET"
      : "รหัสผ่านไม่ถูกต้อง";
    $("loginErr").textContent = msg; show("loginErr");
  }

  async function saveForm(e) {
    e.preventDefault();
    hide("saveErr"); hide("saveOk");
    const r = await api("/api/admin-config", "PUT", {
      status: document.querySelector('input[name="status"]:checked').value,
      fileUrl: $("fUrl").value, title: $("fTitle").value, fileSize: $("fSize").value,
      version: $("fVer").value, maintenanceMsg: $("fMsg").value, cooldownSec: $("fCool").value,
    });
    if (r.status === 401) { hide("panel"); return openLogin(); }
    if (!r.ok) { $("saveErr").textContent = r.data.error || "บันทึกไม่สำเร็จ"; show("saveErr"); return; }
    show("saveOk");
    loadConfig();
  }

  async function logout() { await api("/api/logout", "POST", {}); hide("panel"); }

  /* ---------- เมาส์ + พื้นหลัง ---------- */
  function initFx() {
    const cur = $("cursor"), dot = $("cursorDot");
    addEventListener("mousemove", (e) => {
      document.body.classList.add("mouse");
      cur.style.left = dot.style.left = e.clientX + "px";
      cur.style.top = dot.style.top = e.clientY + "px";
      cur.classList.toggle("hot", !!e.target.closest("button, label"));
    });
    addEventListener("click", (e) => {
      const r = document.createElement("div");
      r.className = "ripple"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
      document.body.appendChild(r); setTimeout(() => r.remove(), 500);
    });

    const cv = $("bg"), ctx = cv.getContext("2d");
    let w = (cv.width = innerWidth), h = (cv.height = innerHeight);
    addEventListener("resize", () => { w = cv.width = innerWidth; h = cv.height = innerHeight; });
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ps = Array.from({ length: Math.min(Math.floor(w / 20), 45) }, () => ({
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
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => hide(b.dataset.close)));
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePopup(); hide("login"); hide("panel"); }
  });

  initFx();
  loadConfig();
})();
