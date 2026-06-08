import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { integrationAvailable } from "../setup.js";
import { appRequest, cleanDb, seedShadow, seedUser } from "../helpers.js";

describe.skipIf(!integrationAvailable)("liff friends API", () => {
  beforeAll(async () => {
    await cleanDb();
  });
  afterEach(async () => {
    await cleanDb();
  });

  it("lists the caller's friends with outstanding totals", async () => {
    const me = await seedUser();
    await seedShadow(me.userId, "a");
    const res = await appRequest("GET", "/api/v1/liff/friends", { cookie: me.cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { friends: { displayName: string | null }[] };
    expect(body.friends.map((f) => f.displayName)).toEqual(["a"]);
  });

  it("creates a shadow friend by name (idempotent per alias)", async () => {
    const me = await seedUser();
    const r1 = await appRequest("POST", "/api/v1/liff/friends", {
      cookie: me.cookie,
      body: { name: "老王" },
    });
    expect(r1.status).toBe(200);
    const f1 = (await r1.json()) as { friend: { userId: string; isVirtual: boolean } };
    expect(f1.friend.isVirtual).toBe(true);

    const r2 = await appRequest("POST", "/api/v1/liff/friends", {
      cookie: me.cookie,
      body: { name: "老王" },
    });
    const f2 = (await r2.json()) as { friend: { userId: string } };
    expect(f2.friend.userId).toBe(f1.friend.userId);
  });

  it("generates a PIN for own shadow friend only", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const mine = await seedShadow(me.userId, "a");

    const ok = await appRequest("POST", `/api/v1/liff/friends/${mine.id}/pin`, {
      cookie: me.cookie,
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { pin: string };
    expect(body.pin).toMatch(/^\d{6}$/);

    const forbidden = await appRequest("POST", `/api/v1/liff/friends/${mine.id}/pin`, {
      cookie: other.cookie,
    });
    expect(forbidden.status).toBe(404);
  });

  it("lists a friend's debts and settles them", async () => {
    const me = await seedUser();
    const friend = await seedShadow(me.userId, "a");
    const { getDb } = await import("../helpers.js");
    const { seedAccount, seedGroup } = await import("../helpers.js");
    const db = await getDb();
    const { transactions, debts } = await import("../../src/db/schema.js");
    const account = await seedAccount(me.userId, "Cash", 1000);
    const group = await seedGroup(me.userId);
    const [tx] = await db
      .insert(transactions)
      .values({
        groupId: group.id,
        accountId: account.id,
        amount: "300.00",
        txDate: "2026-06-05",
        paidByUserId: me.userId,
        kind: "expense",
        note: "午餐",
      })
      .returning();
    await db.insert(debts).values([
      { transactionId: tx!.id, creditorId: me.userId, debtorId: friend.id, amount: "180.00" },
      { transactionId: tx!.id, creditorId: me.userId, debtorId: friend.id, amount: "120.00" },
    ]);

    const list = await appRequest("GET", `/api/v1/liff/friends/${friend.id}/debts`, {
      cookie: me.cookie,
    });
    const lBody = (await list.json()) as { debts: unknown[]; total: number };
    expect(lBody.debts).toHaveLength(2);
    expect(lBody.total).toBe(300);

    const settle = await appRequest("POST", `/api/v1/liff/friends/${friend.id}/settle`, {
      cookie: me.cookie,
      body: {},
    });
    const sBody = (await settle.json()) as { settled: number };
    expect(sBody.settled).toBe(2);

    const after = await appRequest("GET", "/api/v1/liff/friends", { cookie: me.cookie });
    const aBody = (await after.json()) as { friends: { outstanding: number }[] };
    expect(aBody.friends[0]!.outstanding).toBe(0);
  });

  it("cannot view or settle another user's friend debts", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const friend = await seedShadow(me.userId, "a");
    expect(
      (await appRequest("GET", `/api/v1/liff/friends/${friend.id}/debts`, { cookie: other.cookie }))
        .status,
    ).toBe(404);
    expect(
      (
        await appRequest("POST", `/api/v1/liff/friends/${friend.id}/settle`, {
          cookie: other.cookie,
          body: {},
        })
      ).status,
    ).toBe(404);
  });

  it("refuses a PIN for an already-bound friend", async () => {
    const me = await seedUser();
    const { getDb } = await import("../helpers.js");
    const db = await getDb();
    const { users } = await import("../../src/db/schema.js");
    const [bound] = await db
      .insert(users)
      .values({
        lineUserId: "U_bound_x",
        displayName: "小美",
        isVirtual: false,
        createdBy: me.userId,
      })
      .returning();
    const res = await appRequest("POST", `/api/v1/liff/friends/${bound!.id}/pin`, {
      cookie: me.cookie,
    });
    expect(res.status).toBe(400);
  });
});
