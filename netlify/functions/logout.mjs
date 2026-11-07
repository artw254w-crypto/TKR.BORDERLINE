import { json, sameOrigin, CLEAR_SESSION_COOKIE } from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  return json({ ok: true }, 200, { "set-cookie": CLEAR_SESSION_COOKIE });
};
export const config = { path: "/api/logout" };
