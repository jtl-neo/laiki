import { describe, it, expect, afterEach } from "vitest";
import { integrationAvailable } from "../setup.js";
import {
  appRequest,
  cleanDb,
  seedAccount,
  seedGroup,
  seedUser,
} from "../helpers.js";

describe.skipIf(!integrationAvailable)("transactions API", () => {
  afterEach(cleanDb);

  it("POST / creates an expense and decreases balance", async () => {
    const user = await seedUser();
    const g = await seedGroup(user.userId);
    const acc = await seedAccount(user.userId, "Wallet", 500);
    const res = await appRequest("POST", "/api/v1/transactions/", {
      cookie: user.cookie,
      body: {
        groupId: g.id,
        accountId: acc.id,
        amount: 100,
        txDate: "2026-05-19",
        kind: "expense",
      },
    });
    expect(res.status).toBe(200);
    const got = await appRequest("GET", `/api/v1/accounts/${acc.id}`, {
      cookie: user.cookie,
    });
    const body = (await got.json()) as { account: { balance: string } };
    expect(Number(body.account.balance)).toBe(400);
  });

  it("POST income increases balance", async () => {
    const user = await seedUser();
    const g = await seedGroup(user.userId);
    const acc = await seedAccount(user.userId, "Wallet", 100);
    await appRequest("POST", "/api/v1/transactions/", {
      cookie: user.cookie,
      body: {
        groupId: g.id,
        accountId: acc.id,
        amount: 50,
        txDate: "2026-05-19",
        kind: "income",
      },
    });
    const got = await appRequest("GET", `/api/v1/accounts/${acc.id}`, {
      cookie: user.cookie,
    });
    const body = (await got.json()) as { account: { balance: string } };
    expect(Number(body.account.balance)).toBe(150);
  });

  it("PATCH amount keeps balance consistent", async () => {
    const user = await seedUser();
    const g = await seedGroup(user.userId);
    const acc = await seedAccount(user.userId, "Wallet", 1000);
    const create = await appRequest("POST", "/api/v1/transactions/", {
      cookie: user.cookie,
      body: {
        groupId: g.id,
        accountId: acc.id,
        amount: 100,
        txDate: "2026-05-19",
        kind: "expense",
      },
    });
    const { tx } = (await create.json()) as { tx: { id: string } };

    const patch = await appRequest("PATCH", `/api/v1/transactions/${tx.id}`, {
      cookie: user.cookie,
      body: { amount: 250 },
    });
    expect(patch.status).toBe(200);

    const got = await appRequest("GET", `/api/v1/accounts/${acc.id}`, {
      cookie: user.cookie,
    });
    const body = (await got.json()) as { account: { balance: string } };
    expect(Number(body.account.balance)).toBe(750);
  });

  it("DELETE reverts the balance", async () => {
    const user = await seedUser();
    const g = await seedGroup(user.userId);
    const acc = await seedAccount(user.userId, "Wallet", 1000);
    const create = await appRequest("POST", "/api/v1/transactions/", {
      cookie: user.cookie,
      body: {
        groupId: g.id,
        accountId: acc.id,
        amount: 300,
        txDate: "2026-05-19",
        kind: "expense",
      },
    });
    const { tx } = (await create.json()) as { tx: { id: string } };

    const del = await appRequest("DELETE", `/api/v1/transactions/${tx.id}`, {
      cookie: user.cookie,
    });
    expect(del.status).toBe(200);

    const got = await appRequest("GET", `/api/v1/accounts/${acc.id}`, {
      cookie: user.cookie,
    });
    const body = (await got.json()) as { account: { balance: string } };
    expect(Number(body.account.balance)).toBe(1000);
  });

  it("forbidden when user is not group member", async () => {
    const user = await seedUser();
    const intruder = await seedUser();
    const g = await seedGroup(user.userId);
    const acc = await seedAccount(user.userId);
    const res = await appRequest("POST", "/api/v1/transactions/", {
      cookie: intruder.cookie,
      body: {
        groupId: g.id,
        accountId: acc.id,
        amount: 10,
        txDate: "2026-05-19",
      },
    });
    expect(res.status).toBe(403);
  });
});
