// ตัวนับถอยหลังแบบ "เลขวิ่ง": ตอนแสดงครั้งแรก หรือเวลาปลายทางถูกเปลี่ยน (กระโดด > 2 วิ)
// เลขแต่ละช่องจะสุ่มวิ่งเร็ว ๆ แล้วค่อย ๆ ช้าลงและล็อกเป็นค่าจริงทีละช่อง (วัน → ชม. → นาที → วิ) จากนั้นเดินตามเวลาจริงทุกวินาที
// ใช้: trkCd.bind(cdEl, () => เวลาที่เหลือเป็น ms)  (cdEl ต้องมี <b data-u="d|h|m|s"> 4 ช่อง)
(() => {
  "use strict";
  const MAXV = { d: 99, h: 23, m: 59, s: 59 }, ORDER = ["d", "h", "m", "s"];
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const items = new Set(), seen = {}; let loop = 0;
  const pad = (n) => String(n).padStart(2, "0");
  const parts = (s) => ({ d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 });

  function frame() {
    const now = performance.now(); let spinning = false;
    for (const it of items) {
      const cd = it.el;
      if (!cd.isConnected) { items.delete(it); continue; }
      if (cd.hidden || cd.offsetParent === null) { it.prev = null; continue; } // ซ่อนอยู่: ครั้งหน้าที่แสดงให้วิ่งใหม่
      const s = Math.max(0, Math.floor(it.get() / 1000)), real = parts(s);
      if (it.prev === null && it.key && seen[it.key]) { // วาดใหม่ (เช่น มีคนโหวตทำให้รายการรีเฟรช) แต่เวลาปลายทางเดิม → ไม่ต้องวิ่งซ้ำ
        const o = seen[it.key]; if (Math.abs(s - (o.s - Math.round((Date.now() - o.t) / 1000))) <= 2) it.prev = s;
      }
      if (it.key) seen[it.key] = { s, t: Date.now() };
      if (it.prev === null || Math.abs(s - it.prev) > 2) { it.t0 = now; it.spin = !reduce() && s > 0; it.locked = {}; it.bucket = {}; }
      it.prev = s;
      for (const [i, k] of ORDER.entries()) {
        const b = it.b[k]; if (!b) continue;
        const lockAt = it.t0 + 550 + i * 260;
        let txt;
        if (it.spin && now < lockAt) {
          spinning = true;
          const p = Math.min(1, (now - it.t0) / (lockAt - it.t0)), step = 35 + 140 * p * p; // ยิ่งใกล้ล็อกยิ่งช้า
          const bk = Math.floor(now / step);
          if (it.bucket[k] !== bk) { it.bucket[k] = bk; it.rnd = it.rnd || {}; it.rnd[k] = Math.floor(Math.random() * (MAXV[k] + 1)); }
          txt = pad((it.rnd && it.rnd[k]) || 0); b.classList.add("spin"); b.classList.remove("lock");
        } else {
          txt = pad(real[k]);
          if (b.classList.contains("spin")) { b.classList.remove("spin"); b.classList.add("lock"); setTimeout(() => b.classList.remove("lock"), 420); }
        }
        if (b.textContent !== txt) b.textContent = txt;
      }
      if (it.spin && now > it.t0 + 550 + 3 * 260 + 50) it.spin = false;
    }
    // ระหว่างวิ่งอัปเดตถี่ ๆ ปกติเช็กทุก 200ms (แสดงผลเปลี่ยนเฉพาะตอนค่าเปลี่ยนจริง)
    clearTimeout(loop); loop = setTimeout(frame, spinning ? 33 : 200);
  }
  window.trkCd = {
    bind(el, get, key) {
      for (const it of items) if (it.el === el) { it.get = get; return; }
      const b = {}; el.querySelectorAll("b[data-u]").forEach((x) => { b[x.dataset.u] = x; });
      items.add({ el, get, key, b, prev: null, t0: 0, spin: false, locked: {}, bucket: {} });
      clearTimeout(loop); frame();
    },
  };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { clearTimeout(loop); frame(); } });
})();
