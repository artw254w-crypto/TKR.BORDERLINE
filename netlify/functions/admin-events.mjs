import { json, isAdmin, sameOrigin, readJson } from "../lib/shared.mjs";
import { resolveVideos, sweepVideos, videoIds } from "../lib/video.mjs";
import { getEvents, saveEvents, validateEvents } from "../lib/events.mjs";

export default async (req) => {
  if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);
  if (req.method === "GET") return json(await getEvents());
  if (req.method === "PUT") {
    if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
    let body; try { body = await readJson(req, 100000); } catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
    const r = validateEvents(body, await getEvents());
    if (r.error) return json({ error: r.error }, 400);
    const rv = await resolveVideos(r.value);
    if (rv.error) return json({ error: rv.error }, 400);
    await saveEvents(rv.value);
    await sweepVideos(videoIds(rv.value));
    return json(rv.value);
  }
  return json({ error: "method" }, 405);
};
export const config = { path: "/api/admin-events" };
