import { describe, it, expect, afterEach } from "vitest";
import { integrationAvailable } from "../setup.js";
import {
  appRequest,
  cleanDb,
  getDb,
  seedAccount,
  seedGroup,
  seedUser,
} from "../helpers.js";

describe.skipIf(!integrationAvailable)("settle API", () => {
  afterEach(cleanDb);

  async function addMember(groupId: string, userId: string): Promise<void> {
    const db = await getDb();
    const { groupMembers } = await import("../../src/db/schema.js");
    await db.insert(groupMembers).values({
      groupId,
      userId,
      role: "member",
      joinedVia: "manual",
    });
  }

  it("GET /:id/balances returns net per member", async () => {
    const u1 = await seedUser("U1");
    const u2 = await seedUser("U2");
    const g = await seedGroup(u1.userId);
    await addMember(g.id, u2.userId);
    const acc = await seedAccount(u1.userId, "Wallet", 1000);

    // U1 pays 300, split equally between u1 and u2 -> u2 owes 150 to u1.
    await appRequest("POST", "/api/v1/transactions/", {
      cookie: u1.cookie,
      body: {
        groupId: g.id,
        accountId: acc.id,
        amount: 300,
        txDate: "2026-05-19",
        kind: "expense",
        splits: [
          { userId: u1.userId, amount: 150 },
          { userId: u2.userId, amount: 150 },
        ],
      },
    });

    const res = await appRequest("GET", `/api/v1/groups/${g.id}/balances`, {
      cookie: u1.cookie,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { balances: { userId: string; net: number }[] };
    const map = new Map(body.balances.map((b) => [b.userId, b.net]));
    expect(map.get(u1.userId)).toBe(150);
    expect(map.get(u2.userId)).toBe(-150);
  });

  it("GET /:id/settle suggests min transfers", async () => {
    const u1 = await seedUser();
    const u2 = await seedUser();
    const g = await seedGroup(u1.userId);
    await addMember(g.id, u2.userId);
    const acc = await seedAccount(u1.userId, "Wallet", 1000);

    await appRequest("POST", "/api/v1/transactions/", {
      cookie: u1.cookie,
      body: {
        groupId: g.id,
        accountId: acc.id,
        amount: 100,
        txDate: "2026-05-19",
        kind: "expense",
        splits: [
          { userId: u1.userId, amount: 50 },
          { userId: u2.userId, amount: 50 },
        ],
      },
    });

    const res = await appRequest("GET", `/api/v1/groups/${g.id}/settle`, {
      cookie: u1.cookie,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      transfers: { fromUserId: string; toUserId: string; amount: number }[];
    };
    expect(body.transfers.length).toBe(1);
    expect(body.transfers[0]?.fromUserId).toBe(u2.userId);
    expect(body.transfers[0]?.toUserId).toBe(u1.userId);
    expect(body.transfers[0]?.amount).toBe(50);
  });

  it("POST record-paid writes a settlement row", async () => {
    const u1 = await seedUser();
    const u2 = await seedUser();
    const g = await seedGroup(u1.userId);
    await addMember(g.id, u2.userId);

    const res = await appRequest("POST", `/api/v1/groups/${g.id}/settle/record-paid`, {
      cookie: u1.cookie,
      body: {
        fromUserId: u2.userId,
        toUserId: u1.userId,
        amount: 50,
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      settlement: { amount: string; fromUserId: string };
    };
    expect(Number(body.settlement.amount)).toBe(50);
    expect(body.settlement.fromUserId).toBe(u2.userId);
  });

  it("non-member is forbidden", async () => {
    const u1 = await seedUser();
    const stranger = await seedUser();
    const g = await seedGroup(u1.userId);
    const res = await appRequest("GET", `/api/v1/groups/${g.id}/balances`, {
      cookie: stranger.cookie,
    });
    expect(res.status).toBe(403);
  });
});
