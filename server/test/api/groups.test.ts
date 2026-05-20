import { describe, it, expect, afterEach } from "vitest";
import { integrationAvailable } from "../setup.js";
import { appRequest, cleanDb, seedGroup, seedUser } from "../helpers.js";

describe.skipIf(!integrationAvailable)("groups API", () => {
  afterEach(cleanDb);

  it("GET / lists user's groups (membership-based)", async () => {
    const user = await seedUser();
    await seedGroup(user.userId, "G1");
    await seedGroup(user.userId, "G2");
    const res = await appRequest("GET", "/api/v1/groups/", { cookie: user.cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { groups: { name: string }[] };
    expect(body.groups.map((g) => g.name).sort()).toEqual(["G1", "G2"]);
  });

  it("POST / creates a group and adds creator as owner", async () => {
    const user = await seedUser();
    const res = await appRequest("POST", "/api/v1/groups/", {
      cookie: user.cookie,
      body: { name: "New" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { group: { id: string; name: string } };
    expect(body.group.name).toBe("New");

    const detail = await appRequest("GET", `/api/v1/groups/${body.group.id}`, {
      cookie: user.cookie,
    });
    const dBody = (await detail.json()) as {
      members: { userId: string; role: string }[];
    };
    const me = dBody.members.find((m) => m.userId === user.userId);
    expect(me?.role).toBe("owner");
  });

  it("PATCH /:id requires owner", async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    const g = await seedGroup(owner.userId);
    const bad = await appRequest("PATCH", `/api/v1/groups/${g.id}`, {
      cookie: stranger.cookie,
      body: { name: "X" },
    });
    expect(bad.status).toBe(403);

    const ok = await appRequest("PATCH", `/api/v1/groups/${g.id}`, {
      cookie: owner.cookie,
      body: { name: "Renamed" },
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { group: { name: string } };
    expect(body.group.name).toBe("Renamed");
  });

  it("members CRUD (owner-only add/remove)", async () => {
    const owner = await seedUser();
    const m = await seedUser();
    const g = await seedGroup(owner.userId);
    const add = await appRequest("POST", `/api/v1/groups/${g.id}/members`, {
      cookie: owner.cookie,
      body: { userId: m.userId },
    });
    expect(add.status).toBe(200);
    const list = await appRequest("GET", `/api/v1/groups/${g.id}/members`, {
      cookie: owner.cookie,
    });
    const lBody = (await list.json()) as { members: { userId: string }[] };
    expect(lBody.members.some((x) => x.userId === m.userId)).toBe(true);

    const rm = await appRequest(
      "DELETE",
      `/api/v1/groups/${g.id}/members/${m.userId}`,
      { cookie: owner.cookie },
    );
    expect(rm.status).toBe(200);
  });

  it("non-member forbidden to view detail", async () => {
    const owner = await seedUser();
    const other = await seedUser();
    const g = await seedGroup(owner.userId);
    const res = await appRequest("GET", `/api/v1/groups/${g.id}`, {
      cookie: other.cookie,
    });
    expect(res.status).toBe(403);
  });
});
