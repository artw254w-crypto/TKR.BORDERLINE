import { json, sameOrigin } from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  return json({ ok: true }, 200, {
    "set-cookie": "trk_session=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0",
  });
};
export const config = { path: "/api/logout" };
