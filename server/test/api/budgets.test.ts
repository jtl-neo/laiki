import { describe, it, expect, afterEach } from "vitest";
import { integrationAvailable } from "../setup.js";
import {
  appRequest,
  cleanDb,
  seedAccount,
  seedGroup,
  seedUser,
} from "../helpers.js";

describe.skipIf(!integrationAvailable)("budgets API", () => {
  afterEach(cleanDb);

  it("POST / creates a budget", async () => {
    const user = await seedUser();
    const res = await appRequest("POST", "/api/v1/budgets/", {
      cookie: user.cookie,
      body: { monthlyLimit: 500 },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      budget: { id: string; monthlyLimit: string };
    };
    expect(Number(body.budget.monthlyLimit)).toBe(500);
  });

  it("POST upserts when (user, group, category) tuple matches", async () => {
    const user = await seedUser();
    const a = await appRequest("POST", "/api/v1/budgets/", {
      cookie: user.cookie,
      body: { monthlyLimit: 100, category: "food" },
    });
    const aBody = (await a.json()) as { budget: { id: string } };
    const b = await appRequest("POST", "/api/v1/budgets/", {
      cookie: user.cookie,
      body: { monthlyLimit: 200, category: "food" },
    });
    const bBody = (await b.json()) as { budget: { id: string; monthlyLimit: string } };
    expect(bBody.budget.id).toBe(aBody.budget.id);
    expect(Number(bBody.budget.monthlyLimit)).toBe(200);
  });

  it("GET / computes spent in the current month", async () => {
    const user = await seedUser();
    const g = await seedGroup(user.userId);
    const acc = await seedAccount(user.userId, "Wallet", 1000);

    await appRequest("POST", "/api/v1/budgets/", {
      cookie: user.cookie,
      body: { monthlyLimit: 1000, groupId: g.id },
    });

    const today = new Date().toISOString().slice(0, 10);
    await appRequest("POST", "/api/v1/transactions/", {
      cookie: user.cookie,
      body: {
        groupId: g.id,
        accountId: acc.id,
        amount: 120,
        txDate: today,
        kind: "expense",
      },
    });
    await appRequest("POST", "/api/v1/transactions/", {
      cookie: user.cookie,
      body: {
        groupId: g.id,
        accountId: acc.id,
        amount: 80,
        txDate: today,
        kind: "expense",
      },
    });

    const res = await appRequest("GET", "/api/v1/budgets/", { cookie: user.cookie });
    const body = (await res.json()) as {
      budgets: { spent: number; percent: number; monthlyLimit: string }[];
    };
    expect(body.budgets[0]?.spent).toBe(200);
    expect(body.budgets[0]?.percent).toBeCloseTo(0.2);
  });

  it("DELETE /:id removes budget", async () => {
    const user = await seedUser();
    const create = await appRequest("POST", "/api/v1/budgets/", {
      cookie: user.cookie,
      body: { monthlyLimit: 100 },
    });
    const { budget } = (await create.json()) as { budget: { id: string } };
    const del = await appRequest("DELETE", `/api/v1/budgets/${budget.id}`, {
      cookie: user.cookie,
    });
    expect(del.status).toBe(200);
  });

  it("DELETE forbidden for non-owner", async () => {
    const owner = await seedUser();
    const other = await seedUser();
    const create = await appRequest("POST", "/api/v1/budgets/", {
      cookie: owner.cookie,
      body: { monthlyLimit: 100 },
    });
    const { budget } = (await create.json()) as { budget: { id: string } };
    const del = await appRequest("DELETE", `/api/v1/budgets/${budget.id}`, {
      cookie: other.cookie,
    });
    expect(del.status).toBe(403);
  });
});
