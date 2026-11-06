import { json, isAdmin, sameOrigin, readJson, getConfig, saveConfig, validateConfig } from "../lib/shared.mjs";

export default async (req) => {
  if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);

  if (req.method === "GET") return json(await getConfig());

  if (req.method === "PUT") {
    if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
    let body;
    try { body = await readJson(req); } catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
    if (body && body.statusOnly) {
      if (body.status !== "ONLINE" && body.status !== "OFFLINE") return json({ error: "สถานะไม่ถูกต้อง" }, 400);
      const next = { ...(await getConfig()), status: body.status };
      await saveConfig(next);
      return json(next);
    }
    const result = validateConfig(body, await getConfig());
    if (result.error) return json({ error: result.error }, 400);
    await saveConfig(result.value);
    return json(result.value);
  }
  return json({ error: "method" }, 405);
};
export const config = { path: "/api/admin-config" };
