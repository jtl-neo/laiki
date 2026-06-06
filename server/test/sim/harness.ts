import { vi } from "vitest";
import type { webhook } from "@line/bot-sdk";
import { cleanDb } from "../helpers.js";
import { fakeMessagingClient, resetFakeLine, replies, pushes } from "./fakeLine.js";
import { fakeProvider } from "./fakeProvider.js";

/**
 * Simulation harness: replays LINE webhook events through the real
 * dispatch() with two fakes swapped in —
 * - line/client.js is module-mocked (vi.doMock + dynamic imports), so
 *   every reply/push lands in fakeLine's capture arrays;
 * - lib/quota.ts hands out fakeProvider when LAIKI_FAKE_AI=1, so no real
 *   LLM is ever called.
 *
 * Usage in a test file:
 *   const sim = await setupSim();      // once per file (beforeAll)
 *   await resetSim();                  // per test (beforeEach)
 *   fakeProvider.enqueue({...});
 *   await sim.send(textEvent("U_me", "今天吃午餐200"));
 */
export type Sim = {
  send: (event: webhook.Event) => Promise<void>;
  replies: typeof replies;
  pushes: typeof pushes;
  provider: typeof fakeProvider;
};

let cached: Sim | null = null;

const FAKE_IMAGE_BYTES = Buffer.from("fake-image-bytes");

export async function setupSim(): Promise<Sim> {
  if (cached) return cached;

  process.env.LAIKI_FAKE_AI = "1";
  process.env.LINE_CHANNEL_SECRET ??= "test_secret";
  process.env.LINE_CHANNEL_ACCESS_TOKEN ??= "test_token";

  // Must run BEFORE the webhook module graph is imported; everything below
  // uses dynamic imports so the mock takes effect for the whole graph.
  vi.doMock("../../src/line/client.js", () => ({
    lineClient: () => fakeMessagingClient,
    lineBlobClient: () => ({
      async getMessageContent(_messageId: string): Promise<ReadableStream> {
        return new Blob([FAKE_IMAGE_BYTES]).stream();
      },
    }),
    channelSecret: () => process.env.LINE_CHANNEL_SECRET ?? "test_secret",
  }));

  const quota = await import("../../src/lib/quota.js");
  quota.setFakeProvider(fakeProvider);

  const { dispatch } = await import("../../src/routes/webhook/line.js");

  cached = {
    send: (event) => dispatch(event),
    replies,
    pushes,
    provider: fakeProvider,
  };
  return cached;
}

/** Per-test reset: wipe DB, captured sends and the provider queue. */
export async function resetSim(): Promise<void> {
  await cleanDb();
  resetFakeLine();
  fakeProvider.reset();
}
