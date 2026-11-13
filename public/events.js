(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fmt = (t) => new Date(t).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const J = async (url, method = "GET", body) => {
    const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin", cache: "no-store" });
    let d = null; try { d = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data: d };
  };
  let skew = 0, data = null, timer = 0, refetchAt = 0;
  const voted = () => { try { return JSON.parse(localStorage.getItem("trkVoted") || "{}"); } catch { return {}; } };
  const setVoted = (id, o) => { try { const v = voted(); v[id] = o; localStorage.setItem("trkVoted", JSON.stringify(v)); } catch {} };

  const panel = (title, open = true) => { const d = h("details", "ev-p"); d.open = open; d.appendChild(h("summary", "", title)); const b = h("div", "ev-b"); d.appendChild(b); return [d, b]; };

  function build() {
    if ($("evRoot")) return;
    const root = h("section", "ev-wrap"); root.id = "evRoot"; root.hidden = true;
    const anchor = $("steps"); anchor.parentNode.insertBefore(root, anchor);
  }

  function render() {
    const root = $("evRoot"); if (!root || !data) return;
    const keep = new Set([...root.querySelectorAll("details")].filter((d) => !d.open).map((d) => d.dataset.k));
    root.textContent = "";
    if (data.releases.length) {
      const [d, b] = panel("Next drop · เปิดเนื้อหา"); d.dataset.k = "rel";
      data.releases.forEach((r) => {
        const c = h("div", "ev-card"); c.appendChild(h("small", "", "เปิดวันที่ " + fmt(r.openAt))); c.appendChild(h("h4", "", r.title));
        if (r.desc) c.appendChild(h("p", "", r.desc));
        const cd = h("div", "cd"); cd.dataset.t = r.openAt;
        ["d:วัน", "h:ชม.", "m:นาที", "s:วิ"].forEach((x) => { const [k, l] = x.split(":"); const s = h("div"); const b2 = h("b", "", "00"); b2.dataset.u = k; s.appendChild(b2); s.appendChild(h("span", "", l)); cd.appendChild(s); });
        c.appendChild(cd); b.appendChild(c);
      });
      root.appendChild(d);
    }
    if (data.announcements.length) {
      const [d, b] = panel("Announcements · ประกาศ"); d.dataset.k = "ann";
      data.announcements.forEach((a) => { const c = h("div", "ev-card" + (a.auto ? " auto" : "")); c.appendChild(h("small", "", fmt(a.at))); c.appendChild(h("h4", "", a.title)); if (a.body) c.appendChild(h("p", "", a.body)); b.appendChild(c); });
      root.appendChild(d);
    }
    data.polls.forEach((p) => {
      const [d, b] = panel("Poll · โหวต"); d.dataset.k = "poll" + p.id;
      const st = { live: "● เปิดโหวต", ended: "▸ จบแล้ว", upcoming: "◷ เร็วๆ นี้" }[p.status];
      b.appendChild(h("span", "ev-tag " + p.status, st));
      b.appendChild(h("h4", "", p.question));
      b.appendChild(h("small", "", p.status === "upcoming" ? "เริ่ม " + fmt(p.startsAt) : (p.status === "live" ? "ปิดโหวต " : "จบเมื่อ ") + fmt(p.endsAt) + " · " + p.total + " โหวต"));
      const mine = voted()[p.id], msg = h("div", "ev-msg");
      p.options.forEach((o) => {
        const w = p.winners.includes(o.id), box = h("div", "ev-opt" + (w ? " win" : ""));
        const row = h("div", "ev-row"); row.appendChild(h("span", "", (w ? "★ " : "") + o.label)); row.appendChild(h("em", "", p.status === "upcoming" ? "" : o.votes + " · " + o.pct + "%")); box.appendChild(row);
        const bar = h("div", "ev-bar"), i = h("i"); i.style.width = (p.status === "upcoming" ? 0 : o.pct) + "%"; bar.appendChild(i); box.appendChild(bar);
        if (p.status === "live") {
          const btn = h("button", "ev-vote", mine === o.id ? "✓ โหวตแล้ว" : "โหวต"); btn.type = "button"; btn.disabled = !!mine;
          btn.addEventListener("click", async () => {
            btn.disabled = true; msg.textContent = "กำลังส่ง...";
            const r = await J("/api/vote", "POST", { pollId: p.id, optionId: o.id });
            if (r.ok) { setVoted(p.id, o.id); data = r.data; skew = data.now - Date.now(); render(); }
            else { if (r.status === 409) setVoted(p.id, o.id); msg.textContent = (r.data && r.data.error) || "โหวตไม่สำเร็จ"; if (r.status === 409) load(); }
          });
          box.appendChild(btn);
        }
        b.appendChild(box);
      });
      b.appendChild(msg); root.appendChild(d);
    });
    root.querySelectorAll("details").forEach((d) => { if (keep.has(d.dataset.k)) d.open = false; });
    root.hidden = !root.firstChild;
    tick();
  }

  function tick() {
    const now = Date.now() + skew; let ended = false;
    document.querySelectorAll("#evRoot .cd").forEach((cd) => {
      let s = Math.max(0, Math.floor((+cd.dataset.t - now) / 1000)); if (s === 0) ended = true;
      const v = { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
      cd.querySelectorAll("b").forEach((b) => { b.textContent = String(v[b.dataset.u]).padStart(2, "0"); });
    });
    if (data) data.polls.forEach((p) => { if ((p.status === "live" && now >= p.endsAt) || (p.status === "upcoming" && now >= p.startsAt)) ended = true; });
    if (ended && Date.now() - refetchAt > 3000) { refetchAt = Date.now(); load(); } // ถึงเวลาแล้ว ดึงข้อมูลใหม่ → ประกาศ "เปิดแล้ว" ขึ้นเอง
  }

  async function load() {
    const r = await J("/api/events"); if (!r.ok || !r.data) return;
    data = r.data; skew = data.now - Date.now(); build(); render();
  }

  // ---------- แผงแอดมิน ----------
  const toLocal = (t) => { if (!t) return ""; const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const fromLocal = (v) => (v ? new Date(v).getTime() : 0);
  let st = null;

  function field(parent, label, el) { const l = h("label", "", label); l.appendChild(el); parent.appendChild(l); return el; }
  function inp(val, type = "text", max = 80) { const i = document.createElement(type === "area" ? "textarea" : "input"); if (type !== "area") i.type = type; if (type === "area") i.rows = 2; i.maxLength = max; i.value = val || ""; return i; }

  function drawAdmin() {
    const body = $("evaBody"); body.textContent = "";
    const sect = (title, key, mk, blank, row) => {
      body.appendChild(h("h4", "", title));
      st[key].forEach((it, idx) => { const w = h("div", "it"); row(w, it); const del = h("button", "mini del", "🗑 ลบรายการนี้"); del.type = "button"; del.onclick = () => { collect(); st[key].splice(idx, 1); drawAdmin(); }; w.appendChild(del); w._it = it; w.dataset.k = key; body.appendChild(w); });
      const add = h("button", "mini", "＋ " + mk); add.type = "button"; add.onclick = () => { collect(); st[key].push(blank()); drawAdmin(); }; body.appendChild(add);
    };
    sect("◈ ตั้งเวลาเปิดเนื้อหา (มีนับถอยหลัง + ประกาศอัตโนมัติเมื่อถึงเวลา)", "releases", "เพิ่มเนื้อหา", () => ({ title: "", desc: "", openAt: Date.now() + 864e5, announceTitle: "", announceBody: "" }), (w, it) => {
      it._f = { title: field(w, "ชื่อเนื้อหา", inp(it.title)), openAt: field(w, "เวลาเปิด", inp(toLocal(it.openAt), "datetime-local")), desc: field(w, "คำอธิบาย", inp(it.desc, "area", 300)),
        announceTitle: field(w, "หัวข้อประกาศตอนเปิด (ว่าง = ใช้ค่าอัตโนมัติ)", inp(it.announceTitle)), announceBody: field(w, "ข้อความประกาศตอนเปิด", inp(it.announceBody, "area", 400)) };
    });
    sect("◈ ประกาศ (ตั้งเวลาล่วงหน้าได้ จะขึ้นเองเมื่อถึงเวลา)", "announcements", "เพิ่มประกาศ", () => ({ title: "", body: "", at: Date.now() }), (w, it) => {
      it._f = { title: field(w, "หัวข้อ", inp(it.title)), at: field(w, "เวลาที่แสดง", inp(toLocal(it.at), "datetime-local")), body: field(w, "เนื้อหา", inp(it.body, "area", 600)) };
    });
    sect("◈ โพลโหวต (ผู้ชนะประกาศอัตโนมัติเมื่อจบ)", "polls", "เพิ่มโพล", () => ({ question: "", options: [{ label: "" }, { label: "" }], startsAt: Date.now(), endsAt: Date.now() + 3 * 864e5, winnerNote: "" }), (w, it) => {
      it._f = { question: field(w, "คำถาม", inp(it.question, "text", 120)) };
      const two = h("div", "two"); w.appendChild(two);
      it._f.startsAt = field(two, "เริ่มโหวต", inp(toLocal(it.startsAt), "datetime-local")); it._f.endsAt = field(two, "จบโหวต", inp(toLocal(it.endsAt), "datetime-local"));
      it._f.winnerNote = field(w, "ข้อความเสริมตอนประกาศผู้ชนะ (ไม่บังคับ)", inp(it.winnerNote, "text", 200));
      it._f.opts = it.options.map((o) => { const i = field(w, "ตัวเลือก" + (o.votes != null ? ` (${o.votes} โหวต)` : ""), inp(o.label, "text", 60)); return i; });
      const ao = h("button", "mini", "＋ ตัวเลือก"); ao.type = "button"; ao.onclick = () => { collect(); if (it.options.length < 8) it.options.push({ label: "" }); drawAdmin(); }; w.appendChild(ao);
    });
  }

  function collect() {
    $("evaBody").querySelectorAll(".it").forEach((w) => {
      const it = w._it, f = it._f; if (!f) return;
      for (const k of Object.keys(f)) {
        if (k === "opts") f.opts.forEach((i, n) => { it.options[n].label = i.value; });
        else if (k === "openAt" || k === "at" || k === "startsAt" || k === "endsAt") it[k] = fromLocal(f[k].value);
        else it[k] = f[k].value;
      }
    });
  }
  const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === "_f" ? undefined : v)));

  async function openAdmin() {
    const r = await J("/api/admin-events");
    if (r.status === 401) { alert("ต้องล็อกอินแอดมินก่อน"); return; }
    st = r.data || { releases: [], announcements: [], polls: [] };
    $("evaErr").hidden = true; $("evaOk").hidden = true; drawAdmin(); $("evAdmin").hidden = false;
  }
  async function saveAdmin() {
    collect(); $("evaErr").hidden = true; $("evaOk").hidden = true;
    const r = await J("/api/admin-events", "PUT", strip(st));
    if (!r.ok) { $("evaErr").textContent = (r.data && r.data.error) || "บันทึกไม่สำเร็จ"; $("evaErr").hidden = false; return; }
    st = r.data; drawAdmin(); $("evaOk").hidden = false; load();
  }

  function mountAdmin() {
    const tools = document.querySelector("#panel .tools"); if (!tools || $("evBtn")) return;
    const b = h("button", "tool"); b.id = "evBtn"; b.type = "button"; b.innerHTML = '<span class="ic">📅</span>เวลา/ประกาศ/โหวต';
    tools.insertBefore(b, $("logoutBtn")); b.addEventListener("click", openAdmin);
    const m = h("div", "modal"); m.id = "evAdmin"; m.hidden = true; m.setAttribute("role", "dialog");
    const box = h("div", "box xwide eva"); const hd = h("div", "phead"); hd.appendChild(h("h3", "orb", "EVENTS"));
    const x = h("button", "x static", "✕"); x.type = "button"; x.onclick = () => { m.hidden = true; }; hd.appendChild(x); box.appendChild(hd);
    const body = h("div"); body.id = "evaBody"; box.appendChild(body);
    const er = h("div", "err"); er.id = "evaErr"; er.hidden = true; const ok = h("div", "okmsg", "บันทึกเรียบร้อย"); ok.id = "evaOk"; ok.hidden = true; box.append(er, ok);
    const bt = h("div", "btns end"); const sv = h("button", "btn", "💾 บันทึก"); sv.type = "button"; sv.onclick = saveAdmin; bt.appendChild(sv); box.appendChild(bt);
    m.appendChild(box); m.addEventListener("mousedown", (e) => { if (e.target === m) m.hidden = true; }); document.body.appendChild(m);
  }

  const start = () => { build(); mountAdmin(); load(); timer = setInterval(tick, 1000); setInterval(load, 60000); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
