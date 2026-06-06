import type { messagingApi } from "@line/bot-sdk";

/**
 * In-memory capture of every LINE send. Wired up by harness.ts via
 * vi.mock("src/line/client.js") — all reply/push traffic funnels through
 * lineClient(), so mocking that single module captures everything.
 */
export type CapturedReply = {
  replyToken: string;
  messages: messagingApi.Message[];
};

export type CapturedPush = {
  to: string;
  messages: messagingApi.Message[];
};

export const replies: CapturedReply[] = [];
export const pushes: CapturedPush[] = [];

export function resetFakeLine(): void {
  replies.length = 0;
  pushes.length = 0;
}

export function lastReply(): CapturedReply | undefined {
  return replies[replies.length - 1];
}

/** All quick-reply labels on the last reply (flattened across messages). */
export function quickReplyLabels(reply = lastReply()): string[] {
  if (!reply) return [];
  return reply.messages.flatMap(
    (m) => m.quickReply?.items?.map((i) => i.action.label ?? "") ?? [],
  );
}

/** Postback data strings offered on the last reply's quick replies. */
export function quickReplyPostbackData(reply = lastReply()): string[] {
  if (!reply) return [];
  return reply.messages.flatMap(
    (m) =>
      m.quickReply?.items
        ?.map((i) => (i.action.type === "postback" ? (i.action.data ?? "") : ""))
        .filter(Boolean) ?? [],
  );
}

export function pushTargets(): string[] {
  return pushes.map((p) => p.to);
}

/** altText of all flex messages in a captured send. */
export function flexAltTexts(reply = lastReply()): string[] {
  if (!reply) return [];
  return reply.messages
    .filter((m): m is messagingApi.FlexMessage => m.type === "flex")
    .map((m) => m.altText);
}

/** Serialize a message batch for deep content assertions. */
export function messageText(messages: messagingApi.Message[]): string {
  return JSON.stringify(messages);
}

/** Stub MessagingApiClient: records sends, answers profile lookups. */
export const fakeMessagingClient = {
  async replyMessage(args: {
    replyToken: string;
    messages: messagingApi.Message[];
  }): Promise<unknown> {
    replies.push({ replyToken: args.replyToken, messages: args.messages });
    return {};
  },
  async pushMessage(args: { to: string; messages: messagingApi.Message[] }): Promise<unknown> {
    pushes.push({ to: args.to, messages: args.messages });
    return {};
  },
  async getProfile(lineUserId: string): Promise<{ displayName: string; userId: string }> {
    return { displayName: `User ${lineUserId.slice(-4)}`, userId: lineUserId };
  },
  async getGroupMemberProfile(
    _groupId: string,
    lineUserId: string,
  ): Promise<{ displayName: string; userId: string }> {
    return { displayName: `User ${lineUserId.slice(-4)}`, userId: lineUserId };
  },
  async showLoadingAnimation(_args: { chatId: string; loadingSeconds?: number }): Promise<unknown> {
    return {};
  },
};
