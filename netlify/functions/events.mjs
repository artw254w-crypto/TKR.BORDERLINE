import { json, sameOrigin, readJson, clientIp, rateLimit } from "../lib/shared.mjs";
import { getEvents, publicEvents, castVote } from "../lib/events.mjs";

export default async (req, ctx) => {
  const path = new URL(req.url).pathname;
  if (path === "/api/events" && req.method === "GET") return json(publicEvents(await getEvents()));
  if (path === "/api/vote" && req.method === "POST") {
    if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
    const ip = clientIp(req, ctx);
    if (!(await rateLimit("vote:" + ip, 30, 10 * 60 * 1000))) return json({ error: "Too many votes. Please try again later." }, 429);
    let b; try { b = await readJson(req, 500); } catch { return json({ error: "Invalid data" }, 400); }
    const r = await castVote(String(b.pollId || ""), String(b.optionId || ""), ip);
    return r.error ? json({ error: r.error }, r.status) : json({ ok: true, ...publicEvents(await getEvents()) });
  }
  return json({ error: "method" }, 405);
};
export const config = { path: ["/api/events", "/api/vote"] };
