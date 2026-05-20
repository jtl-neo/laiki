import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retry } from "./retry.js";

describe("retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately when fn succeeds on first try", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 503 and eventually succeeds", async () => {
    const err: { status: number; message: string } = { status: 503, message: "x" };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce("ok");

    const promise = retry(fn, { baseMs: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on persistent 503", async () => {
    const err = { status: 503, message: "boom" };
    const fn = vi.fn().mockRejectedValue(err);

    const promise = retry(fn, { maxRetries: 2, baseMs: 10 });
    const assertion = expect(promise).rejects.toEqual(err);
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on non-retryable status (400)", async () => {
    const err = { status: 400, message: "bad" };
    const fn = vi.fn().mockRejectedValue(err);

    await expect(retry(fn, { baseMs: 10 })).rejects.toEqual(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses exponential delay between attempts", async () => {
    const err = { status: 503, message: "x" };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce("ok");

    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const promise = retry(fn, { baseMs: 100, maxRetries: 3 });
    await vi.runAllTimersAsync();
    await promise;

    const delays = setTimeoutSpy.mock.calls.map((c) => Number(c[1]));
    // base * 2^0 = 100, base * 2^1 = 200 (plus up to 200 random jitter)
    expect(delays[0]).toBeGreaterThanOrEqual(100);
    expect(delays[0]).toBeLessThan(100 + 200);
    expect(delays[1]).toBeGreaterThanOrEqual(200);
    expect(delays[1]).toBeLessThan(200 + 200);
    expect(delays[1]).toBeGreaterThan(delays[0]!);
  });
});
