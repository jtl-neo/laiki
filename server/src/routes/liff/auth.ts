import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { createSession, deleteSession } from "../../lib/sessions.js";
import { SESSION_COOKIE } from "../../lib/auth.js";
import { ensureUserDefaults } from "../../lib/ensureDefaults.js";

const app = new Hono();

const BodySchema = z.object({ idToken: z.string().min(10) });

interface VerifyResponse {
  sub: string;
  aud?: string;
  name?: string;
  picture?: string;
  email?: string;
}

async function verifyIdToken(idToken: string): Promise<VerifyResponse | null> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) throw new Error("LINE_LOGIN_CHANNEL_ID not set");

  const params = new URLSearchParams({ id_token: idToken, client_id: channelId });
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) return null;
  const verified = (await res.json()) as VerifyResponse;
  // LINE's verify endpoint already rejects audience mismatches for the
  // client_id we pass, but double-check the echoed aud as defense in depth.
  if (verified.aud && verified.aud !== channelId) return null;
  return verified;
}

app.post("/auth", async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const verified = await verifyIdToken(parsed.data.idToken);
  if (!verified) return c.json({ error: "invalid id token" }, 401);

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.lineUserId, verified.sub))
    .limit(1);

  let userId: string;
  if (existing) {
    userId = existing.id;
    await db
      .update(users)
      .set({
        displayName: verified.name ?? existing.displayName,
        pictureUrl: verified.picture ?? existing.pictureUrl,
        email: verified.email ?? existing.email,
      })
      .where(eq(users.id, existing.id));
  } else {
    const [u] = await db
      .insert(users)
      .values({
        lineUserId: verified.sub,
        displayName: verified.name ?? "Laiki User",
        pictureUrl: verified.picture ?? null,
        email: verified.email ?? null,
      })
      .returning();
    userId = u!.id;
  }

  await ensureUserDefaults(userId);

  const sid = await createSession(userId);
  setCookie(c, SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return c.json({ ok: true });
});

app.post("/logout", async (c) => {
  const sid = c.req.header("cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
  if (sid) await deleteSession(sid);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

export default app;
