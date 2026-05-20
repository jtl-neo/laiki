import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { userApiKeys, userPreferences } from "../db/schema.js";
import { requireSession } from "../lib/auth.js";
import { encrypt, keyHint } from "../lib/crypto.js";
import { makeProvider } from "../ai/providers/factory.js";
import type { ProviderName } from "../ai/providers/types.js";
import { decrypt } from "../lib/crypto.js";

const app = new Hono<{ Variables: { userId: string } }>();

const PROVIDERS: readonly ProviderName[] = ["gemini", "openai", "anthropic", "ollama"];

const PostBodySchema = z.object({
  provider: z.enum(["gemini", "openai", "anthropic", "ollama"]),
  key: z.string().min(1).max(500),
  endpoint: z.string().url().optional().nullable(),
  model: z.string().min(1).max(200).optional().nullable(),
});

const DefaultBodySchema = z.object({
  provider: z.enum(["gemini", "openai", "anthropic", "ollama"]),
});

app.use("*", requireSession);

app.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select({
      provider: userApiKeys.provider,
      keyHint: userApiKeys.keyHint,
      model: userApiKeys.model,
      endpoint: userApiKeys.endpoint,
      verifiedAt: userApiKeys.verifiedAt,
    })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId))
    .orderBy(asc(userApiKeys.createdAt));

  const [pref] = await db
    .select({ defaultProvider: userPreferences.defaultProvider })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  return c.json({
    keys: rows,
    defaultProvider: pref?.defaultProvider ?? null,
  });
});

app.post("/", async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = PostBodySchema.safeParse(json);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const { provider, key, endpoint, model } = parsed.data;
  const inst = makeProvider({
    provider,
    apiKey: key,
    endpoint: endpoint ?? null,
    model: model ?? null,
  });

  try {
    await inst.verify();
  } catch (e) {
    console.error("BYOK verify failed:", e);
    return c.json({ error: "invalid_key" }, 400);
  }

  const { ciphertext, iv } = encrypt(key);
  const userId = c.get("userId");
  await db
    .insert(userApiKeys)
    .values({
      userId,
      provider,
      encryptedKey: ciphertext,
      encryptionIv: iv,
      keyHint: keyHint(key),
      endpoint: endpoint ?? null,
      model: model ?? null,
      verifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userApiKeys.userId, userApiKeys.provider],
      set: {
        encryptedKey: ciphertext,
        encryptionIv: iv,
        keyHint: keyHint(key),
        endpoint: endpoint ?? null,
        model: model ?? null,
        verifiedAt: new Date(),
      },
    });

  return c.json({ ok: true, provider, keyHint: keyHint(key) });
});

app.delete("/:provider", async (c) => {
  const userId = c.get("userId");
  const p = c.req.param("provider") as ProviderName;
  if (!PROVIDERS.includes(p)) return c.json({ error: "bad request" }, 400);
  await db
    .delete(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, p)));
  return c.json({ ok: true });
});

app.put("/default", async (c) => {
  const userId = c.get("userId");
  const json = await c.req.json().catch(() => null);
  const parsed = DefaultBodySchema.safeParse(json);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  await db
    .insert(userPreferences)
    .values({ userId, defaultProvider: parsed.data.provider })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { defaultProvider: parsed.data.provider, updatedAt: new Date() },
    });
  return c.json({ ok: true, defaultProvider: parsed.data.provider });
});

const ListModelsBodySchema = z.object({
  provider: z.enum(["gemini", "openai", "anthropic", "ollama"]),
  key: z.string().max(500).optional(),
  endpoint: z.string().url().optional().nullable(),
});

app.post("/models", async (c) => {
  const userId = c.get("userId");
  const json = await c.req.json().catch(() => null);
  const parsed = ListModelsBodySchema.safeParse(json);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const { provider, endpoint } = parsed.data;
  let apiKey = parsed.data.key ?? "";
  let storedEndpoint = endpoint ?? null;

  if (!apiKey) {
    const [row] = await db
      .select()
      .from(userApiKeys)
      .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)))
      .limit(1);
    if (row) {
      try {
        apiKey = decrypt(row.encryptedKey, row.encryptionIv);
      } catch {
        apiKey = "";
      }
      storedEndpoint = storedEndpoint ?? row.endpoint;
    }
  }

  if (provider !== "ollama" && !apiKey) {
    return c.json({ error: "key required" }, 400);
  }

  const inst = makeProvider({
    provider,
    apiKey,
    endpoint: storedEndpoint,
    model: null,
  });

  try {
    const models = await inst.listModels();
    return c.json({ models });
  } catch (e) {
    console.error("listModels failed:", e);
    return c.json({ error: "list_failed", message: e instanceof Error ? e.message : String(e) }, 400);
  }
});

const TestBodySchema = z.object({
  provider: z.enum(["gemini", "openai", "anthropic", "ollama"]),
  key: z.string().max(500).optional(),
  endpoint: z.string().url().optional().nullable(),
  model: z.string().max(200).optional().nullable(),
});

app.post("/test", async (c) => {
  const userId = c.get("userId");
  const json = await c.req.json().catch(() => null);
  const parsed = TestBodySchema.safeParse(json);
  if (!parsed.success) return c.json({ ok: false, error: "bad request" });

  const { provider, endpoint, model } = parsed.data;
  let apiKey = parsed.data.key ?? "";
  let useEndpoint = endpoint ?? null;
  let useModel = model ?? null;

  try {
    if (!apiKey) {
      const [row] = await db
        .select()
        .from(userApiKeys)
        .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)))
        .limit(1);
      if (row) {
        try {
          apiKey = decrypt(row.encryptedKey, row.encryptionIv);
        } catch {
          apiKey = "";
        }
        useEndpoint = useEndpoint ?? row.endpoint;
        useModel = useModel ?? row.model;
      }
    }

    if (provider !== "ollama" && !apiKey) {
      return c.json({ ok: false, error: "key required" });
    }

    const inst = makeProvider({
      provider,
      apiKey,
      endpoint: useEndpoint,
      model: useModel,
    });

    const result = await inst.parseStructured<{ reply: string }>({
      systemPrompt:
        "你是友善的記帳助理。用一句話回應「hi」打招呼，回應寫入 reply 欄位。",
      userText: "hi",
      schema: {
        type: "object",
        properties: { reply: { type: "string" } },
        required: ["reply"],
      },
      temperature: 0.7,
    });

    return c.json({ ok: true, reply: result.reply, model: useModel });
  } catch (e) {
    return c.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

export default app;
