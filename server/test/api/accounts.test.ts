import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { integrationAvailable } from "../setup.js";
import {
  appRequest,
  cleanDb,
  seedAccount,
  seedUser,
  type SeededUser,
} from "../helpers.js";

describe.skipIf(!integrationAvailable)("accounts API", () => {
  let user: SeededUser;

  beforeAll(async () => {
    await cleanDb();
  });

  afterEach(async () => {
    await cleanDb();
  });

  it("GET / returns empty list for a new user", async () => {
    user = await seedUser();
    const res = await appRequest("GET", "/api/v1/accounts/", { cookie: user.cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accounts: unknown[] };
    expect(body.accounts).toEqual([]);
  });

  it("POST / creates an account", async () => {
    user = await seedUser();
    const res = await appRequest("POST", "/api/v1/accounts/", {
      cookie: user.cookie,
      body: { name: "Wallet", type: "cash", initialBalance: 100 },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { account: { id: string; balance: string } };
    expect(body.account.id).toBeTruthy();
    expect(Number(body.account.balance)).toBe(100);
  });

  it("GET /:id returns account, PATCH /:id updates name", async () => {
    user = await seedUser();
    const acc = await seedAccount(user.userId, "Old");
    const get = await appRequest("GET", `/api/v1/accounts/${acc.id}`, {
      cookie: user.cookie,
    });
    expect(get.status).toBe(200);
    const patch = await appRequest("PATCH", `/api/v1/accounts/${acc.id}`, {
      cookie: user.cookie,
      body: { name: "New" },
    });
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as { account: { name: string } };
    expect(body.account.name).toBe("New");
  });

  it("DELETE /:id soft-archives the account", async () => {
    user = await seedUser();
    const acc = await seedAccount(user.userId);
    const del = await appRequest("DELETE", `/api/v1/accounts/${acc.id}`, {
      cookie: user.cookie,
    });
    expect(del.status).toBe(200);
    const get = await appRequest("GET", `/api/v1/accounts/${acc.id}`, {
      cookie: user.cookie,
    });
    expect(get.status).toBe(200);
    const body = (await get.json()) as { account: { archivedAt: string | null } };
    expect(body.account.archivedAt).not.toBeNull();
  });

  it("POST /:id/members shares to another user; DELETE removes them", async () => {
    user = await seedUser("Owner");
    const other = await seedUser("Friend");
    const acc = await seedAccount(user.userId, "Shared");

    const add = await appRequest("POST", `/api/v1/accounts/${acc.id}/members`, {
      cookie: user.cookie,
      body: { userId: other.userId },
    });
    expect(add.status).toBe(200);

    const members = await appRequest("GET", `/api/v1/accounts/${acc.id}/members`, {
      cookie: user.cookie,
    });
    const mBody = (await members.json()) as { members: { userId: string }[] };
    expect(mBody.members.some((m) => m.userId === other.userId)).toBe(true);

    const rm = await appRequest(
      "DELETE",
      `/api/v1/accounts/${acc.id}/members/${other.userId}`,
      { cookie: user.cookie },
    );
    expect(rm.status).toBe(200);
  });

  it("unauthorized without cookie", async () => {
    const res = await appRequest("GET", "/api/v1/accounts/");
    expect(res.status).toBe(401);
  });
});
