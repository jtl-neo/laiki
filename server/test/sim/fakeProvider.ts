import type {
  AIProvider,
  ModelInfo,
  ParseStructuredArgs,
} from "../../src/ai/providers/types.js";

/**
 * Queue-driven AIProvider double for simulation tests.
 * - enqueue() responses in scenario order; each parseStructured call
 *   consumes one (an Error entry is thrown instead of returned).
 * - An empty queue THROWS — this catches accidental extra LLM calls.
 * - Every call is recorded for prompt/context assertions.
 */
export class FakeProvider implements AIProvider {
  calls: ParseStructuredArgs[] = [];
  private queue: unknown[] = [];

  enqueue(...responses: unknown[]): void {
    this.queue.push(...responses);
  }

  reset(): void {
    this.calls = [];
    this.queue = [];
  }

  get lastCall(): ParseStructuredArgs | undefined {
    return this.calls[this.calls.length - 1];
  }

  async parseStructured<T>(args: ParseStructuredArgs): Promise<T> {
    this.calls.push(args);
    if (this.queue.length === 0) {
      throw new Error(
        `FakeProvider: unexpected LLM call (queue empty). userText=${JSON.stringify(
          args.userText,
        )}`,
      );
    }
    const next = this.queue.shift();
    if (next instanceof Error) throw next;
    return next as T;
  }

  async verify(): Promise<boolean> {
    return true;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: "fake" }];
  }
}

/** Shared singleton wired into lib/quota.ts via setFakeProvider. */
export const fakeProvider = new FakeProvider();
