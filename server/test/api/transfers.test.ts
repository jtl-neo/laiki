import { describe, it, expect, afterEach } from "vitest";
import { integrationAvailable } from "../setup.js";
import {
  appRequest,
  cleanDb,
  seedAccount,
  seedGroup,
  seedUser,
} from "../helpers.js";

describe.skipIf(!integrationAvailable)("transfers API", () => {
  afterEach(cleanDb);

  it("POST / creates a transfer pair and adjusts balances", async () => {
    const user = await seedUser();
    const g = await seedGroup(user.userId);
    const from = await seedAccount(user.userId, "From", 1000);
    const to = await seedAccount(user.userId, "To", 0);

    const res = await appRequest("POST", "/api/v1/transfers/", {
      cookie: user.cookie,
      body: {
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: 250,
        groupId: g.id,
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      from: { id: string; transferPairId: string | null };
      to: { id: string; transferPairId: string | null };
    };
    expect(body.from.transferPairId).toBe(body.to.id);
    expect(body.to.transferPairId).toBe(body.from.id);

    const fromAcc = await appRequest("GET", `/api/v1/accounts/${from.id}`, {
      cookie: user.cookie,
    });
    const toAcc = await appRequest("GET", `/api/v1/accounts/${to.id}`, {
      cookie: user.cookie,
    });
    const fromBody = (await fromAcc.json()) as { account: { balance: string } };
    const toBody = (await toAcc.json()) as { account: { balance: string } };
    expect(Number(fromBody.account.balance)).toBe(750);
    expect(Number(toBody.account.balance)).toBe(250);
  });

  it("rejects when from == to", async () => {
    const user = await seedUser();
    const g = await seedGroup(user.userId);
    const a = await seedAccount(user.userId, "A", 100);
    const res = await appRequest("POST", "/api/v1/transfers/", {
      cookie: user.cookie,
      body: { fromAccountId: a.id, toAccountId: a.id, amount: 10, groupId: g.id },
    });
    expect(res.status).toBe(400);
  });

  it("rejects when user not in group", async () => {
    const user = await seedUser();
    const intruder = await seedUser();
    const g = await seedGroup(user.userId);
    const from = await seedAccount(intruder.userId, "From", 100);
    const to = await seedAccount(intruder.userId, "To", 0);
    const res = await appRequest("POST", "/api/v1/transfers/", {
      cookie: intruder.cookie,
      body: {
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: 10,
        groupId: g.id,
      },
    });
    expect(res.status).toBe(403);
  });

  it("rejects bad payload", async () => {
    const user = await seedUser();
    const res = await appRequest("POST", "/api/v1/transfers/", {
      cookie: user.cookie,
      body: { amount: -1 },
    });
    expect(res.status).toBe(400);
  });
});
