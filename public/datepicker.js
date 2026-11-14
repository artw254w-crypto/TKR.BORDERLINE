// ตัวเลือกวัน-เวลาแบบปฏิทิน (ใช้แทน input datetime-local) ใช้ได้ทุกธีม
// ใช้: const p = trkDT(ms, { clearable:true, placeholder:"..." }); p.value = "YYYY-MM-DDTHH:mm" (อ่าน/ตั้งได้) ; p.ms ; p.onchange = fn
(() => {
  "use strict";
  const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const MS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  const p2 = (n) => String(n).padStart(2, "0");
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const toIso = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const fromIso = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : 0; };
  const label = (ms) => { const d = new Date(ms); return `${d.getDate()} ${MS[d.getMonth()]} ${d.getFullYear() + 543} · ${p2(d.getHours())}:${p2(d.getMinutes())} น.`; };
  let openPop = null;
  const closePop = () => { if (openPop) { openPop.close(); openPop = null; } };
  addEventListener("keydown", (e) => { if (openPop && e.key === "Escape") { e.stopPropagation(); closePop(); } }, true);
  document.addEventListener("pointerdown", (e) => { if (openPop && !openPop.pop.contains(e.target) && !openPop.root.contains(e.target)) closePop(); }, true);

  window.trkDT = function (initMs, opts = {}) {
    let ms = initMs || 0;
    let view = new Date(ms || Date.now()); view.setDate(1);
    const root = h("div", "tdt");
    const btn = h("button", "tdt-field"); btn.type = "button";
    const clr = h("button", "tdt-x", "✕"); clr.type = "button"; clr.title = "ล้างค่า"; clr.setAttribute("aria-label", "ล้างวันเวลา");
    root.append(btn, clr);
    document.querySelectorAll(".tdt-pop").forEach((o) => { if (o._root && !o._root.isConnected) o.remove(); }); // เก็บกวาดป๊อปอัปของช่องที่ถูกวาดใหม่
    const pop = h("div", "tdt-pop"); pop.hidden = true; pop.setAttribute("role", "dialog"); pop._root = root;
    document.body.appendChild(pop);
    const api = { root, pop, close: () => { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); } };

    const paintField = () => {
      btn.textContent = ""; btn.appendChild(h("span", "tdt-ic", "📅"));
      btn.appendChild(h("span", ms ? "tdt-v" : "tdt-v ph", ms ? label(ms) : (opts.placeholder || "เลือกวันและเวลา")));
      clr.hidden = !(opts.clearable && ms);
    };
    const set = (v, fire = true) => { ms = v; paintField(); if (openPop === api) drawPop(); if (fire) { root.dispatchEvent(new Event("change", { bubbles: true })); if (typeof root.onchange === "function") root.onchange(); } };
    const withTime = (d, base) => { const b = new Date(base || ms || Date.now()); d.setHours(opts.defaultHour != null && !ms ? opts.defaultHour : b.getHours(), ms ? b.getMinutes() : 0, 0, 0); return d.getTime(); };

    function drawPop() {
      pop.textContent = "";
      const head = h("div", "tdt-head");
      const prev = h("button", "tdt-nav", "‹"), next = h("button", "tdt-nav", "›"); prev.type = next.type = "button";
      prev.onclick = () => { view.setMonth(view.getMonth() - 1); drawPop(); }; next.onclick = () => { view.setMonth(view.getMonth() + 1); drawPop(); };
      head.append(prev, h("b", "", `${MONTHS[view.getMonth()]} ${view.getFullYear() + 543}`), next); pop.appendChild(head);
      const grid = h("div", "tdt-grid");
      DOW.forEach((d) => grid.appendChild(h("span", "tdt-dow", d)));
      const first = new Date(view.getFullYear(), view.getMonth(), 1), start = new Date(first); start.setDate(1 - first.getDay());
      const today = new Date(), sel = ms ? new Date(ms) : null;
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const b = h("button", "tdt-d", String(d.getDate())); b.type = "button";
        if (d.getMonth() !== view.getMonth()) b.classList.add("out");
        if (d.toDateString() === today.toDateString()) b.classList.add("today");
        if (sel && d.toDateString() === sel.toDateString()) b.classList.add("sel");
        if (opts.min && new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59).getTime() < opts.min) { b.disabled = true; }
        b.onclick = () => { const nd = new Date(d); set(withTime(nd)); };
        grid.appendChild(b);
      }
      pop.appendChild(grid);
      // เวลา
      const cur = new Date(ms || Date.now());
      const tm = h("div", "tdt-time"); tm.appendChild(h("span", "", "เวลา"));
      const mk = (max, val, fn) => { const s = document.createElement("select"); for (let i = 0; i < max; i++) { const o = h("option", "", p2(i)); o.value = i; if (i === val) o.selected = true; s.appendChild(o); } s.onchange = () => fn(+s.value); return s; };
      const setT = (hh, mm) => { const d = new Date(ms || Date.now()); d.setHours(hh, mm, 0, 0); set(d.getTime()); };
      const hs = mk(24, cur.getHours(), (v) => setT(v, new Date(ms || Date.now()).getMinutes()));
      const mn = mk(60, cur.getMinutes(), (v) => setT(new Date(ms || Date.now()).getHours(), v));
      hs.setAttribute("aria-label", "ชั่วโมง"); mn.setAttribute("aria-label", "นาที");
      tm.append(hs, h("b", "", ":"), mn, h("span", "", "น.")); pop.appendChild(tm);
      // ปุ่มลัด
      const q = h("div", "tdt-quick");
      [["ตอนนี้", 0], ["+1 ชม.", 36e5], ["+1 วัน", 864e5], ["+3 วัน", 3 * 864e5], ["+7 วัน", 7 * 864e5], ["+30 วัน", 30 * 864e5]].forEach(([t, add]) => {
        const b = h("button", "", t); b.type = "button";
        b.onclick = () => { const d = new Date(Date.now() + add); d.setSeconds(0, 0); view = new Date(d); view.setDate(1); set(d.getTime()); };
        q.appendChild(b);
      });
      pop.appendChild(q);
      const foot = h("div", "tdt-foot");
      if (opts.clearable) { const c = h("button", "ghost", "ล้างค่า"); c.type = "button"; c.onclick = () => { set(0); closePop(); }; foot.appendChild(c); }
      const ok = h("button", "ok", "ตกลง"); ok.type = "button"; ok.onclick = () => { if (!ms) set(withTime(new Date(), Date.now())); closePop(); }; foot.appendChild(ok);
      pop.appendChild(foot);
    }
    function place() {
      const r = btn.getBoundingClientRect(), W = Math.min(320, innerWidth - 16);
      pop.style.width = W + "px";
      let left = Math.min(Math.max(8, r.left), innerWidth - W - 8), top = r.bottom + 6;
      const hgt = pop.offsetHeight;
      if (top + hgt > innerHeight - 8) top = r.top - hgt - 6 >= 8 ? r.top - hgt - 6 : Math.max(8, innerHeight - hgt - 8);
      pop.style.left = left + "px"; pop.style.top = top + "px";
    }
    btn.onclick = () => {
      if (openPop === api) return closePop();
      closePop(); view = new Date(ms || Date.now()); view.setDate(1);
      drawPop(); pop.hidden = false; openPop = api; btn.setAttribute("aria-expanded", "true"); place();
    };
    clr.onclick = () => set(0);
    addEventListener("resize", () => { if (openPop === api) place(); });
    document.addEventListener("scroll", () => { if (openPop === api) place(); }, true);
    Object.defineProperty(root, "value", { get: () => toIso(ms), set: (v) => { ms = fromIso(v); paintField(); } });
    Object.defineProperty(root, "ms", { get: () => ms, set: (v) => { ms = v || 0; paintField(); } });
    btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-expanded", "false");
    paintField();
    return root;
  };
})();
