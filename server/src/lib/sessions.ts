import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions } from "../db/schema.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export async function createSession(userId: string): Promise<string> {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return id;
}

export async function readSession(id: string): Promise<{ userId: string } | null> {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!s) return null;
  if (s.expiresAt.getTime() < Date.now()) return null;
  return { userId: s.userId };
}

export async function deleteSession(id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}
