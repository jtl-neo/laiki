import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt, keyHint } from "./crypto.js";

beforeAll(() => {
  process.env.APIKEY_ENC_KEY = randomBytes(32).toString("base64");
});

describe("crypto", () => {
  it("round-trips encrypt + decrypt", () => {
    const plain = "hello secret 你好";
    const { ciphertext, iv } = encrypt(plain);
    expect(decrypt(ciphertext, iv)).toBe(plain);
  });

  it("uses random IV so ciphertext differs across calls", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(Buffer.compare(a.iv, b.iv)).not.toBe(0);
    expect(Buffer.compare(a.ciphertext, b.ciphertext)).not.toBe(0);
  });

  it("throws when ciphertext is tampered", () => {
    const { ciphertext, iv } = encrypt("payload");
    const tampered = Buffer.from(ciphertext);
    tampered[0] = tampered[0]! ^ 0xff;
    expect(() => decrypt(tampered, iv)).toThrow();
  });

  it("keyHint masks short and long keys", () => {
    expect(keyHint("ab")).toBe("****");
    expect(keyHint("abcdef")).toBe("****cdef");
  });
});
