// ระบบ ตั้งเวลาเปิดเนื้อหา / ประกาศ / โหวต  (เก็บใน Netlify Blobs เดียวกับ config)
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { VID_RE } from "./video.mjs";

const store = () => getStore({ name: "trk-site", consistency: "strong" });
const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, n).trim();
const ts = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 4102444800000 ? Math.floor(n) : 0; };
const rid = () => crypto.randomBytes(6).toString("hex");
const vref = (v) => (v && VID_RE.test(String(v.id)) ? { id: String(v.id) } : null);
const keepId = (v) => (/^[a-f0-9]{12}$/.test(String(v)) ? String(v) : rid());

export const EMPTY = { releases: [], announcements: [], polls: [] };

export async function getEvents() {
  try { return (await store().get("events", { type: "json" })) || structuredClone(EMPTY); } catch { return structuredClone(EMPTY); }
}
export const saveEvents = (e) => store().setJSON("events", e);

// ตรวจข้อมูลจากแอดมิน: คะแนนโหวตไม่รับจากฟอร์ม ใช้ค่าเดิมในเซิร์ฟเวอร์เท่านั้น
export function validateEvents(input, current) {
  if (!input || typeof input !== "object") return { error: "ข้อมูลไม่ถูกต้อง" };
  const arr = (a, max) => (Array.isArray(a) ? a.slice(0, max) : []);
  const releases = arr(input.releases, 20).map((r) => ({
    id: keepId(r?.id), title: clean(r?.title, 80), desc: clean(r?.desc, 300), openAt: ts(r?.openAt),
    announceTitle: clean(r?.announceTitle, 80), announceBody: clean(r?.announceBody, 400), announceVideo: vref(r?.announceVideo),
  }));
  if (releases.some((r) => !r.title || !r.openAt)) return { error: "ทุกรายการเปิดเนื้อหาต้องมีชื่อและเวลาเปิด" };
  const announcements = arr(input.announcements, 50).map((a) => ({
    id: keepId(a?.id), title: clean(a?.title, 80), body: clean(a?.body, 600), at: ts(a?.at), video: vref(a?.video),
  }));
  if (announcements.some((a) => !a.title || !a.at)) return { error: "ทุกประกาศต้องมีหัวข้อและเวลา" };
  const old = new Map((current.polls || []).map((p) => [p.id, p]));
  const polls = arr(input.polls, 10).map((p) => {
    const id = keepId(p?.id), prev = old.get(id);
    const oldVotes = new Map((prev?.options || []).map((o) => [o.id, o.votes || 0]));
    const options = arr(p?.options, 8).map((o) => { const oid = keepId(o?.id); return { id: oid, label: clean(o?.label, 60), votes: oldVotes.get(oid) || 0 }; });
    return { id, question: clean(p?.question, 120), options, startsAt: ts(p?.startsAt), endsAt: ts(p?.endsAt), winnerNote: clean(p?.winnerNote, 200) };
  });
  for (const p of polls) {
    if (!p.question || p.options.length < 2 || p.options.some((o) => !o.label)) return { error: "โพลต้องมีคำถามและอย่างน้อย 2 ตัวเลือก" };
    if (!p.startsAt || !p.endsAt || p.endsAt <= p.startsAt) return { error: "เวลาจบโพลต้องหลังเวลาเริ่ม" };
  }
  return { value: { releases, announcements, polls } };
}

const pubVid = (v) => (v ? { video: { id: v.id, type: v.type, size: v.size } } : {});
const pollStatus = (p, now) => (now < p.startsAt ? "upcoming" : now < p.endsAt ? "live" : "ended");

export function publicEvents(e, now = Date.now()) {
  const feed = (e.announcements || []).filter((a) => a.at <= now).map((a) => ({ id: a.id, title: a.title, body: a.body, at: a.at, ...pubVid(a.video) }));
  const releases = [];
  for (const r of e.releases || []) {
    if (r.openAt > now) releases.push({ id: r.id, title: r.title, desc: r.desc, openAt: r.openAt });
    else feed.push({ id: "r" + r.id, title: r.announceTitle || `เปิดเนื้อหาแล้ว: ${r.title}`, body: r.announceBody || r.desc, at: r.openAt, auto: true, ...pubVid(r.announceVideo) });
  }
  const polls = (e.polls || []).filter((p) => p.startsAt <= now + 7 * 864e5).map((p) => {
    const status = pollStatus(p, now), total = p.options.reduce((s, o) => s + o.votes, 0);
    const top = Math.max(...p.options.map((o) => o.votes));
    const winners = status === "ended" && top > 0 ? p.options.filter((o) => o.votes === top).map((o) => o.id) : [];
    if (status === "ended") feed.push({ id: "p" + p.id, title: `ผลโหวต: ${p.question}`, body: winners.length ? `ผู้ชนะ: ${p.options.filter((o) => winners.includes(o.id)).map((o) => o.label).join(", ")}${p.winnerNote ? " · " + p.winnerNote : ""}` : "ไม่มีผู้โหวต", at: p.endsAt, auto: true });
    return { id: p.id, question: p.question, status, startsAt: p.startsAt, endsAt: p.endsAt, total, winners,
      options: p.options.map((o) => ({ id: o.id, label: o.label, votes: o.votes, pct: total ? Math.round((o.votes / total) * 1000) / 10 : 0 })) };
  });
  feed.sort((a, b) => b.at - a.at);
  releases.sort((a, b) => a.openAt - b.openAt);
  return { now, releases, announcements: feed.slice(0, 30), polls };
}

// โหวต: 1 IP ต่อ 1 โพล (เก็บแค่แฮช ไม่เก็บ IP จริง) ไม่ atomic 100% แต่พอสำหรับโพลชุมชน
export async function castVote(pollId, optionId, ip) {
  const s = store();
  const e = await getEvents();
  const p = (e.polls || []).find((x) => x.id === pollId);
  const now = Date.now();
  if (!p) return { error: "ไม่พบโพล", status: 404 };
  if (pollStatus(p, now) !== "live") return { error: "โพลนี้ไม่ได้เปิดโหวตอยู่", status: 409 };
  const o = p.options.find((x) => x.id === optionId);
  if (!o) return { error: "ตัวเลือกไม่ถูกต้อง", status: 400 };
  const h = crypto.createHash("sha256").update(`${ip}|${p.id}`).digest("hex").slice(0, 32);
  const vk = "evvoters/" + p.id;
  let voters = []; try { voters = (await s.get(vk, { type: "json" })) || []; } catch {}
  if (voters.includes(h)) return { error: "คุณโหวตโพลนี้ไปแล้ว", status: 409 };
  voters.push(h); await s.setJSON(vk, voters.slice(-20000));
  o.votes++; await saveEvents(e);
  return { ok: true };
}
