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

  // ใส่วิดีโอให้ <video>: เล่นตรงก่อน ถ้าเล่นไม่ขึ้น (error หรือไม่เริ่มใน 12 วิ) สลับไปทางสำรอง
  // = โหลดทีละชิ้น 1 MB ด้วย fetch ธรรมดา (ไม่พึ่ง Range) ประกอบเป็นไฟล์ในเครื่องแล้วเล่น ใช้ได้แม้การสตรีมถูกตัด/บล็อก
  function attachVideo(el, v, onFail, note) {
    const url = "/api/video/" + v.id; let fell = false, timer = 0;
    const fallback = async () => {
      if (fell) return; fell = true; clearTimeout(timer);
      const SL = 1048576, n = Math.max(1, Math.ceil(v.size / SL)), parts = new Array(n); let done = 0, bad = false, next = 0;
      note("กำลังโหลดวิดีโอ 0% ...");
      const worker = async () => {
        while (!bad) {
          const i = next++; if (i >= n) return;
          const a = i * SL, z = Math.min(v.size, (i + 1) * SL) - 1; let ok = false;
          for (let t = 0; t < 4 && !ok; t++) {
            try { const r = await fetch(`${url}?s=${a}&e=${z}`, { credentials: "same-origin" }); if (r.ok) { const b = await r.arrayBuffer(); if (b.byteLength === z - a + 1) { parts[i] = b; ok = true; } } } catch {}
            if (!ok) await new Promise((r) => setTimeout(r, 400 * (t + 1)));
          }
          if (!ok) { bad = true; return; }
          done++; note(`กำลังโหลดวิดีโอ ${Math.round((done / n) * 100)}% ...`);
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      if (bad) { note(""); return onFail("ดึงไฟล์วิดีโอจากเซิร์ฟเวอร์ไม่สำเร็จ", true); }
      note("");
      el.addEventListener("error", () => onFail("เบราว์เซอร์ถอดรหัสไฟล์นี้ไม่ได้ (โค้ดเดกไม่รองรับ)", false), { once: true });
      el.src = URL.createObjectURL(new Blob(parts, { type: v.type })); el.load();
    };
    el.addEventListener("error", () => { if (!fell) fallback(); }, { once: true });
    timer = setTimeout(() => { if (el.readyState === 0 && !fell) fallback(); }, 12000);
    el.addEventListener("loadedmetadata", () => clearTimeout(timer), { once: true });
    el.src = url + "#t=0.1";
  }

  function player(v) {
    const box = h("div", "ev-vid"), el = document.createElement("video"), note = h("div", "ev-vid-note");
    el.controls = true; el.preload = "metadata"; el.playsInline = true; el.setAttribute("controlsList", "nodownload"); el.disablePictureInPicture = true;
    el.addEventListener("pause", () => { if (pending) setTimeout(() => { if (pending && !playing()) { pending = false; render(); } }, 300); });
    box.append(el, note);
    attachVideo(el, v, (msg) => { box.appendChild(h("div", "ev-vid-err", msg + " — ลองรีเฟรชหน้าหรือเปิดด้วยเบราว์เซอร์อื่น")); }, (t) => { note.textContent = t; note.hidden = !t; });
    return box;
  }
  const playing = () => [...document.querySelectorAll("#evRoot video")].some((v) => !v.paused && !v.ended);
  let pending = false, sig = "";

  function render() {
    const root = $("evRoot"); if (!root || !data) return;
    if (playing()) { pending = true; return; } // กำลังดูวิดีโออยู่ ไม่รีเฟรชทับ รอจนหยุดค่อยอัปเดต
    const keep = new Set([...root.querySelectorAll("details")].filter((d) => !d.open).map((d) => d.dataset.k));
    root.textContent = "";
    if (data.releases.length) {
      const [d, b] = panel("Next drop · เปิดเนื้อหา"); d.dataset.k = "rel";
      data.releases.forEach((r) => {
        const c = h("div", "ev-card"); c.appendChild(h("small", "", "เปิดวันที่ " + fmt(r.openAt))); c.appendChild(h("h4", "", r.title));
        if (r.desc) c.appendChild(h("p", "", r.desc));
        const cd = h("div", "cd"); cd.dataset.t = r.openAt;
        ["d:วัน", "h:ชม.", "m:นาที", "s:วิ"].forEach((x) => { const [k, l] = x.split(":"); const s = h("div"); const b2 = h("b", "", "00"); b2.dataset.u = k; s.appendChild(b2); s.appendChild(h("span", "", l)); cd.appendChild(s); });
        c.appendChild(cd); b.appendChild(c); window.trkCd.bind(cd, () => +cd.dataset.t - (Date.now() + skew), "r" + r.id);
      });
      root.appendChild(d);
    }
    if (data.announcements.length) {
      const [d, b] = panel("Announcements · ประกาศ"); d.dataset.k = "ann";
      data.announcements.forEach((a) => { const c = h("div", "ev-card" + (a.auto ? " auto" : "")); c.appendChild(h("small", "", fmt(a.at))); c.appendChild(h("h4", "", a.title)); if (a.body) c.appendChild(h("p", "", a.body)); if (a.video) c.appendChild(player(a.video)); b.appendChild(c); });
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
            if (r.ok) { setVoted(p.id, o.id); data = r.data; skew = data.now - Date.now(); sig = ""; render(); }
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
    document.querySelectorAll("#evRoot .cd").forEach((cd) => { if (+cd.dataset.t - now <= 0) ended = true; });
    if (data) data.polls.forEach((p) => { if ((p.status === "live" && now >= p.endsAt) || (p.status === "upcoming" && now >= p.startsAt)) ended = true; });
    if (ended && Date.now() - refetchAt > 3000) { refetchAt = Date.now(); load(); } // ถึงเวลาแล้ว ดึงข้อมูลใหม่ → ประกาศ "เปิดแล้ว" ขึ้นเอง
  }

  async function load() {
    const r = await J("/api/events"); if (!r.ok || !r.data) return;
    skew = r.data.now - Date.now();
    const sg = JSON.stringify([r.data.releases, r.data.announcements, r.data.polls]);
    data = r.data; build();
    if (sg !== sig) { sig = sg; render(); }
  }

  // ---------- แผงแอดมิน ----------
  const toLocal = (t) => { if (!t) return ""; const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const fromLocal = (v) => (v ? new Date(v).getTime() : 0);
  let st = null;

  const dt = (ms) => trkDT(ms, {});
  function field(parent, label, el) { const l = h("label", "", label); l.appendChild(el); parent.appendChild(l); return el; }
  function inp(val, type = "text", max = 80) { const i = document.createElement(type === "area" ? "textarea" : "input"); if (type !== "area") i.type = type; if (type === "area") i.rows = 2; i.maxLength = max; i.value = val || ""; return i; }

  const fmtMB = (n) => (n / 1048576).toFixed(1) + " MB";
  let uploading = 0;
  // ลองเปิดไฟล์ในเบราว์เซอร์ก่อนอัปโหลด: ถ้าเล่นไม่ได้ (เช่น HEVC/H.265, ไฟล์เสีย) ผู้ชมก็เล่นไม่ได้เหมือนกัน
  const canPlay = (file) => new Promise((res) => {
    const v = document.createElement("video"), u = URL.createObjectURL(file); let done = false;
    const end = (ok) => { if (done) return; done = true; URL.revokeObjectURL(u); v.removeAttribute("src"); res(ok); };
    v.preload = "metadata"; v.muted = true; v.onloadedmetadata = () => end(v.videoWidth > 0 || v.duration > 0); v.onerror = () => end(false);
    setTimeout(() => end(true), 8000); v.src = u;
  });
  async function uploadVideo(it, key, file, refresh) {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|m4v|mov|webm|mkv|3gp)$/i.test(file.name)) { it._up = { err: "เลือกไฟล์วิดีโอ (MP4, MOV, WebM)" }; refresh(); return; }
    const playable = true;
    uploading++; it._up = { pct: 0, name: file.name }; refresh();
    try {
      const i = await J("/api/admin-video", "POST", { action: "init", name: file.name, size: file.size });
      if (!i.ok) throw new Error((i.data && i.data.error) || "เริ่มอัปโหลดไม่สำเร็จ (HTTP " + i.status + (i.status === 401 ? " — ล็อกอินแอดมินหมดอายุ" : i.status === 403 ? " — เปิดเว็บจากที่อยู่เดียวกับที่ล็อกอิน" : "") + ")");
      const { id, chunk, chunks } = i.data;
      for (let n = 0; n < chunks; n++) {
        const part = file.slice(n * chunk, Math.min(file.size, (n + 1) * chunk));
        let ok = false, last = "", code = 0;
        for (let t = 0; t < 3 && !ok; t++) {
          const r = await fetch("/api/admin-video?vid=" + id + "&n=" + n, { method: "PUT", body: part, credentials: "same-origin", headers: { "content-type": "application/octet-stream" } });
          if (r.ok) ok = true; else { code = r.status; try { last = (await r.json()).error; } catch {} if (r.status < 500 && r.status !== 429) break; }
        }
        if (!ok) throw new Error((last || "อัปโหลดก้อนที่ " + (n + 1) + " ไม่สำเร็จ") + " (HTTP " + code + ")");
        it._up.pct = Math.round(((n + 1) / chunks) * 100); refresh();
      }
      const f = await J("/api/admin-video", "POST", { action: "finish", vid: id });
      if (!f.ok) throw new Error((f.data && f.data.error) || "ปิดงานอัปโหลดไม่สำเร็จ");
      it[key] = f.data.video; it._up = playable ? null : { warn: "อัปโหลดสำเร็จ แต่เบราว์เซอร์นี้เปิดไฟล์นี้ไม่ได้ (โค้ดเดกอาจเป็น HEVC/H.265) ถ้าพรีวิวด้านล่างไม่ขึ้นภาพ ให้แปลงไฟล์ด้วย tools/convert-to-web-mp4.bat (ลากไฟล์ไปวางบนไฟล์นี้) แล้วอัปโหลดใหม่" };
    } catch (e) { it._up = { err: String(e.message || e) }; }
    uploading--; refresh();
  }
  function vidWidget(w, it, key) {
    const box = h("div", "vidw"); w.appendChild(box);
    const file = document.createElement("input"); file.type = "file"; file.accept = "video/*,.mp4,.m4v,.mov,.webm,.mkv"; file.hidden = true;
    const refresh = () => {
      box.textContent = ""; box.appendChild(h("small", "", "🎬 วิดีโอแนบ (ไม่ใช่ลิงก์ YouTube) จะขึ้นเล่นในหน้าประกาศเมื่อถึงเวลาประกาศเท่านั้น · MP4 / MOV / WebM ทุกแบบ ไม่จำกัดขนาด (ไฟล์ใหญ่ใช้เวลาอัปโหลดนาน อย่าปิดหน้านี้)"));
      const v = it[key], up = it._up;
      if (up && up.pct != null) { box.appendChild(h("div", "vst", `กำลังอัปโหลด ${up.name} ... ${up.pct}%`)); const bar = h("div", "ev-bar"), i = h("i"); i.style.width = up.pct + "%"; bar.appendChild(i); box.appendChild(bar); }
      else {
        if (up && up.err) box.appendChild(h("div", "vst bad", "✖ " + up.err));
        if (up && up.warn) box.appendChild(h("div", "vst warn", "⚠ " + up.warn));
        if (v) {
          box.appendChild(h("div", "vst", `✔ ${v.name} · ${fmtMB(v.size)}`));
          const pv = document.createElement("video"); pv.controls = true; pv.preload = "metadata"; pv.playsInline = true;
          const pn = h("div", "vst"); pn.hidden = true;
          attachVideo(pv, v, async (msg, net) => {
            let d = "";
            try { const r = await fetch("/api/video/" + v.id + "?s=0&e=1", { credentials: "same-origin", cache: "no-store" }); d = `เซิร์ฟเวอร์ตอบ HTTP ${r.status} · ${r.headers.get("content-type") || "-"}`; } catch (e) { d = "ติดต่อเซิร์ฟเวอร์ไม่ได้: " + e.message; }
            box.appendChild(h("div", "vst bad", `✖ พรีวิวเล่นไม่ได้: ${msg} | ${d}`));
          }, (t) => { pn.textContent = t; pn.hidden = !t; });
          box.appendChild(pn); box.appendChild(pv);
        }
        const pick = h("button", "mini", v ? "🔄 เปลี่ยนวิดีโอ" : "⬆ เลือกไฟล์วิดีโอ"); pick.type = "button"; pick.onclick = () => file.click(); box.appendChild(pick);
        if (v) { const rm = h("button", "mini del", "✖ เอาวิดีโอออก"); rm.type = "button"; rm.onclick = () => { it[key] = null; it._up = null; refresh(); }; box.appendChild(rm); }
      }
      box.appendChild(file);
    };
    file.addEventListener("change", () => { const f = file.files && file.files[0]; file.value = ""; uploadVideo(it, key, f, refresh); });
    refresh();
  }

  // "เปิดให้ดาวน์โหลดไฟล์" 2 แบบ: ระบุวันเวลา / หลังประกาศ N วัน M ชม. (ผูกกับสถานะดาวน์โหลดและตัวนับถอยหลังหน้าเว็บ)
  function opensWidget(w, it, baseKey) {
    const box = h("div", "opn"); w.appendChild(box);
    if (!it.opens) it.opens = { mode: "none" };
    const o = it.opens;
    const seg = h("div", "seg"), body = h("div"), calc = h("div", "calc");
    box.append(h("small", "", "🔓 เปิดให้ดาวน์โหลดไฟล์ (ผูกกับปุ่มดาวน์โหลดหน้าเว็บ: ล็อกพร้อมนับถอยหลังจนถึงเวลานี้ แล้วเปิดเองอัตโนมัติ)"), seg, body, calc);
    const when = () => (o.mode === "at" ? o.at || 0 : o.mode === "after" ? ((it._f[baseKey].ms || 0) + (o.days || 0) * 864e5 + (o.hours || 0) * 36e5) : 0);
    const upd = () => { const t = when(); calc.textContent = t ? "→ ไฟล์จะเปิดวันที่ " + fmt(t) : ""; };
    const num = (key, max) => { const i = document.createElement("input"); i.type = "number"; i.min = 0; i.max = max; i.value = o[key] || 0; i.oninput = () => { o[key] = Math.max(0, Math.min(max, parseInt(i.value, 10) || 0)); upd(); }; return i; };
    const draw = () => {
      seg.textContent = "";
      [["none", "ไม่ตั้ง"], ["at", "📅 ระบุวันเวลา"], ["after", "⏱ หลังประกาศ N วัน/ชม."]].forEach(([m, t]) => {
        const b = h("button", o.mode === m ? "on" : "", t); b.type = "button";
        b.onclick = () => { o.mode = m; if (m === "at" && !o.at) o.at = (it._f[baseKey].ms || Date.now()) + 864e5; if (m === "after") { o.days = o.days ?? 1; o.hours = o.hours ?? 0; } draw(); };
        seg.appendChild(b);
      });
      body.textContent = "";
      if (o.mode === "at") { const p = trkDT(o.at, { clearable: false }); p.addEventListener("change", () => { o.at = p.ms; upd(); }); body.appendChild(p); }
      if (o.mode === "after") { const r = h("div", "row2"); r.append(h("span", "", "หลังเวลาประกาศ"), num("days", 365), h("span", "", "วัน"), num("hours", 23), h("span", "", "ชั่วโมง")); body.appendChild(r); }
      upd();
    };
    it._f[baseKey].addEventListener("change", upd);
    draw();
  }

  function drawAdmin() {
    const body = $("evaBody"); body.textContent = "";
    const sect = (title, key, mk, blank, row) => {
      body.appendChild(h("h4", "", title));
      st[key].forEach((it, idx) => { const w = h("div", "it"); row(w, it); const del = h("button", "mini del", "🗑 ลบรายการนี้"); del.type = "button"; del.onclick = () => { collect(); st[key].splice(idx, 1); drawAdmin(); }; w.appendChild(del); w._it = it; w.dataset.k = key; body.appendChild(w); });
      const add = h("button", "mini", "＋ " + mk); add.type = "button"; add.onclick = () => { collect(); st[key].push(blank()); drawAdmin(); }; body.appendChild(add);
    };
    sect("◈ ตั้งเวลาเปิดเนื้อหา (มีนับถอยหลัง + ประกาศอัตโนมัติเมื่อถึงเวลา)", "releases", "เพิ่มเนื้อหา", () => ({ title: "", desc: "", openAt: Date.now() + 864e5, announceTitle: "", announceBody: "" }), (w, it) => {
      it._f = { title: field(w, "ชื่อเนื้อหา", inp(it.title)), openAt: field(w, "เวลาเปิด", dt(it.openAt)), desc: field(w, "คำอธิบาย", inp(it.desc, "area", 300)),
        announceTitle: field(w, "หัวข้อประกาศตอนเปิด (ว่าง = ใช้ค่าอัตโนมัติ)", inp(it.announceTitle)), announceBody: field(w, "ข้อความประกาศตอนเปิด", inp(it.announceBody, "area", 400)) };
      vidWidget(w, it, "announceVideo");
      opensWidget(w, it, "openAt");
    });
    sect("◈ ประกาศ (ตั้งเวลาล่วงหน้าได้ จะขึ้นเองเมื่อถึงเวลา)", "announcements", "เพิ่มประกาศ", () => ({ title: "", body: "", at: Date.now() }), (w, it) => {
      it._f = { title: field(w, "หัวข้อ", inp(it.title)), at: field(w, "เวลาที่แสดง", dt(it.at)), body: field(w, "เนื้อหา", inp(it.body, "area", 600)) };
      vidWidget(w, it, "video");
      opensWidget(w, it, "at");
    });
    sect("◈ โพลโหวต (ผู้ชนะประกาศอัตโนมัติเมื่อจบ)", "polls", "เพิ่มโพล", () => ({ question: "", options: [{ label: "" }, { label: "" }], startsAt: Date.now(), endsAt: Date.now() + 3 * 864e5, winnerNote: "" }), (w, it) => {
      it._f = { question: field(w, "คำถาม", inp(it.question, "text", 120)) };
      const two = h("div", "two"); w.appendChild(two);
      it._f.startsAt = field(two, "เริ่มโหวต", dt(it.startsAt)); it._f.endsAt = field(two, "จบโหวต", dt(it.endsAt));
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
  const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k[0] === "_" ? undefined : v)));

  async function openAdmin() {
    const r = await J("/api/admin-events");
    if (r.status === 401) { alert("ต้องล็อกอินแอดมินก่อน"); return; }
    st = r.data || { releases: [], announcements: [], polls: [] };
    $("evaErr").hidden = true; $("evaOk").hidden = true; drawAdmin(); $("evAdmin").hidden = false;
  }
  async function saveAdmin() {
    collect(); $("evaErr").hidden = true; $("evaOk").hidden = true;
    if (uploading) { $("evaErr").textContent = "กำลังอัปโหลดวิดีโออยู่ รอให้เสร็จก่อนค่อยบันทึก"; $("evaErr").hidden = false; return; }
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

  const start = () => { build(); mountAdmin(); load(); timer = setInterval(tick, 1000); setInterval(load, 5000); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
