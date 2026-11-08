/* สลับธีมหน้าเว็บ: A ซีเนมา / B สว่างสะอาด / C เทอร์มินัล / D ป๊อป
   จำธีมล่าสุดในเครื่องไว้ใช้ทันทีตอนเปิดหน้า แล้ว app.js ค่อยยืนยันกับค่าจากเซิร์ฟเวอร์ */
(() => {
  "use strict";
  const FILES = { A: "/theme-cinema.css", B: "/theme-light.css", C: "/theme-terminal.css", D: "/theme-pop.css" };
  let cur = null;
  function apply(t, persist = true) {
    if (!FILES[t]) t = "A";
    if (t !== cur) {
      cur = t;
      let l = document.getElementById("themeCss");
      if (!l) { l = document.createElement("link"); l.rel = "stylesheet"; l.id = "themeCss"; document.head.appendChild(l); }
      l.href = FILES[t];
      document.documentElement.dataset.theme = t;
    }
    if (persist) { try { localStorage.setItem("trk_theme", t); } catch {} }
  }
  window.trkTheme = apply;
  let saved = "A"; try { saved = localStorage.getItem("trk_theme") || "A"; } catch {}
  apply(saved);
})();
