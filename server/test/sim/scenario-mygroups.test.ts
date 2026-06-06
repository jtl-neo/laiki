import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { integrationAvailable } from "../setup.js";
import { getDb, seedShadow } from "../helpers.js";
import { setupSim, resetSim, type Sim } from "./harness.js";
import { textEvent, followEvent, postbackEvent } from "./events.js";
import { lastReply, messageText, pushTargets } from "./fakeLine.js";

const ME = "U_mygroups_me";
const FRIEND = "U_mygroups_friend";

async function uid(lineUserId: string): Promise<string> {
  const db = await getDb();
  const { users } = await import("../../src/db/schema.js");
  const [u] = await db.select().from(users).where(eq(users.lineUserId, lineUserId));
  return u!.id;
}

describe.skipIf(!integrationAvailable)("scenario: DM 群組管理", () => {
  let sim: Sim;

  beforeAll(async () => {
    sim = await setupSim();
  });

  beforeEach(async () => {
    await resetSim();
    await sim.send(followEvent(ME));
    sim.replies.length = 0;
  });

  it("建立群組 creates a split group and shows the member-manage card", async () => {
    const me = await uid(ME);
    await seedShadow(me, "a");

    await sim.send(textEvent(ME, "建立群組 出遊分帳"));
    const reply = messageText(lastReply()!.messages);
    expect(reply).toContain("出遊分帳");
    expect(reply).toContain("mygroup_toggle");

    const db = await getDb();
    const { groups } = await import("../../src/db/schema.js");
    const [g] = await db.select().from(groups).where(eq(groups.name, "出遊分帳"));
    expect(g!.type).toBe("split");
    expect(g!.lineGroupId).toBeNull();
    expect(g!.ownerUserId).toBe(me);
  });

  it("建立基金 creates a fund group with its own fund account", async () => {
    await sim.send(textEvent(ME, "建立基金 家裡用的東西"));
    const db = await getDb();
    const { groups, accounts } = await import("../../src/db/schema.js");
    const [g] = await db.select().from(groups).where(eq(groups.name, "家裡用的東西"));
    expect(g!.type).toBe("fund");
    expect(g!.fundAccountId).not.toBeNull();
    const [acct] = await db.select().from(accounts).where(eq(accounts.id, g!.fundAccountId!));
    expect(acct!.name).toContain("基金池");
  });

  it("我的群組 lists DM groups but never the personal group", async () => {
    await sim.send(textEvent(ME, "建立群組 出遊分帳"));
    sim.replies.length = 0;
    await sim.send(textEvent(ME, "我的群組"));
    const reply = messageText(lastReply()!.messages);
    expect(reply).toContain("出遊分帳");
    expect(reply).not.toContain("我的記帳"); // personal group hidden
  });

  it("toggles a friend in and out via postback", async () => {
    const me = await uid(ME);
    const shadow = await seedShadow(me, "a");
    await sim.send(textEvent(ME, "建立群組 出遊分帳"));
    const groupId = /mygroup_toggle&groupId=([0-9a-f-]+)/.exec(
      messageText(lastReply()!.messages),
    )?.[1];
    expect(groupId).toBeTruthy();

    const db = await getDb();
    const { groupMembers } = await import("../../src/db/schema.js");
    const membership = () =>
      db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId!), eq(groupMembers.userId, shadow.id)));

    await sim.send(postbackEvent(ME, `action=mygroup_toggle&groupId=${groupId}&userId=${shadow.id}`));
    expect(await membership()).toHaveLength(1);

    await sim.send(postbackEvent(ME, `action=mygroup_toggle&groupId=${groupId}&userId=${shadow.id}`));
    expect(await membership()).toHaveLength(0);
  });

  it("non-owners cannot manage members", async () => {
    const me = await uid(ME);
    await seedShadow(me, "a");
    await sim.send(textEvent(ME, "建立群組 出遊分帳"));
    const groupId = /mygroup_toggle&groupId=([0-9a-f-]+)/.exec(
      messageText(lastReply()!.messages),
    )?.[1];

    await sim.send(followEvent(FRIEND));
    sim.replies.length = 0;
    await sim.send(postbackEvent(FRIEND, `action=mygroup_members&groupId=${groupId}`));
    expect(messageText(lastReply()!.messages)).toContain("擁有者");
  });

  it("full circle: 建立基金 → 加綁定好友 → 基金記帳 → 好友收推播", async () => {
    const me = await uid(ME);

    // Bound friend: previously a shadow, claimed via PIN.
    const shadow = await seedShadow(me, "a");
    const { generateBindingCode, claimBindingCode } = await import(
      "../../src/lib/shadowAccount.js"
    );
    await sim.send(followEvent(FRIEND));
    const code = await generateBindingCode(shadow.id, me);
    const claim = await claimBindingCode(code, FRIEND, "真實a");
    expect(claim.ok).toBe(true);
    const friendUserId = claim.ok ? claim.userId : "";

    // Create the fund and link the bound friend from the DM interface.
    await sim.send(textEvent(ME, "建立基金 家裡用的東西"));
    const groupId = /mygroup_toggle&groupId=([0-9a-f-]+)/.exec(
      messageText(lastReply()!.messages),
    )?.[1];
    await sim.send(
      postbackEvent(ME, `action=mygroup_toggle&groupId=${groupId}&userId=${friendUserId}`),
    );

    // Seed the fund with a balance so the card shows a sane number.
    const db = await getDb();
    const { groups, accounts } = await import("../../src/db/schema.js");
    const [g] = await db.select().from(groups).where(eq(groups.id, groupId!));
    await db
      .update(accounts)
      .set({ balance: "5000.00" })
      .where(eq(accounts.id, g!.fundAccountId!));

    // Fund expense from the DM.
    sim.provider.enqueue({
      type: "fund_expense",
      is_complete: true,
      confidence: 0.93,
      data: { description: "衛生紙", total_amount: 450, fund_name: "家裡用的東西" },
    });
    sim.replies.length = 0;
    sim.pushes.length = 0;
    await sim.send(textEvent(ME, "用共同基金買衛生紙 450"));
    const pendingId = /pendingId=([0-9a-f-]+)/.exec(messageText(lastReply()!.messages))?.[1];
    await sim.send(postbackEvent(ME, `action=confirm_entry&pendingId=${pendingId}`));

    const [fundAcct] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, g!.fundAccountId!));
    expect(Number(fundAcct!.balance)).toBe(4550);

    // Both the owner and the bound friend get the fund-change push.
    expect(pushTargets().sort()).toEqual([ME, FRIEND].sort());
  });
});
