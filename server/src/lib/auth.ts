import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { readSession } from "./sessions.js";

export const SESSION_COOKIE = "laiki_session";

export const requireSession: MiddlewareHandler<{
  Variables: { userId: string };
}> = async (c, next) => {
  const id = getCookie(c, SESSION_COOKIE);
  if (!id) return c.json({ error: "unauthorized" }, 401);
  const s = await readSession(id);
  if (!s) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", s.userId);
  await next();
};
