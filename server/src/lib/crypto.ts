import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const k = process.env.APIKEY_ENC_KEY;
  if (!k) throw new Error("APIKEY_ENC_KEY not set");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("APIKEY_ENC_KEY must be 32 bytes base64");
  return buf;
}

export function encrypt(plain: string): { ciphertext: Buffer; iv: Buffer } {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([enc, tag]), iv };
}

export function decrypt(ciphertext: Buffer, iv: Buffer): string {
  const tag = ciphertext.subarray(ciphertext.length - TAG_LEN);
  const enc = ciphertext.subarray(0, ciphertext.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function keyHint(key: string): string {
  return key.length <= 4 ? "****" : `****${key.slice(-4)}`;
}
