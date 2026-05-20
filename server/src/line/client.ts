import { messagingApi } from "@line/bot-sdk";

let _client: messagingApi.MessagingApiClient | null = null;
let _blob: messagingApi.MessagingApiBlobClient | null = null;

export function lineClient(): messagingApi.MessagingApiClient {
  if (_client) return _client;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not set");
  _client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
  return _client;
}

export function lineBlobClient(): messagingApi.MessagingApiBlobClient {
  if (_blob) return _blob;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not set");
  _blob = new messagingApi.MessagingApiBlobClient({ channelAccessToken: token });
  return _blob;
}

export function channelSecret(): string {
  const s = process.env.LINE_CHANNEL_SECRET;
  if (!s) throw new Error("LINE_CHANNEL_SECRET not set");
  return s;
}
