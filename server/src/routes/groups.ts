import { Hono } from "hono";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { groups, groupMembers, users } from "../db/schema.js";
import { requireSession } from "../lib/auth.js";

const app = new Hono<{ Variables: { userId: string } }>();

app.use("*", requireSession);

export async function userInGroup(userId: string, groupId: string): Promise<boolean> {
  const [m] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.groupId, groupId)))
    .limit(1);
  return !!m;
}

export async function userIsOwner(userId: string, groupId: string): Promise<boolean> {
  const [g] = await db
    .select({ ownerUserId: groups.ownerUserId })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (g && g.ownerUserId === userId) return true;
  const [m] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.userId, userId),
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.role, "owner"),
      ),
    )
    .limit(1);
  return !!m;
}

app.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select({
      id: groups.id,
      type: groups.type,
      name: groups.name,
      lineGroupId: groups.lineGroupId,
      ownerUserId: groups.ownerUserId,
      defaultSplit: groups.defaultSplit,
      currency: groups.currency,
      createdAt: groups.createdAt,
      updatedAt: groups.updatedAt,
    })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .where(eq(groupMembers.userId, userId))
    .orderBy(desc(groups.createdAt));
  return c.json({ groups: rows });
});

const CreateSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(["shared", "fund", "split"]).optional(),
  defaultSplit: z.enum(["equal", "payer", "custom"]).optional(),
  currency: z.string().optional(),
});

app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const [group] = await db
    .insert(groups)
    .values({
      name: parsed.data.name,
      type: parsed.data.type ?? "shared",
      defaultSplit: parsed.data.defaultSplit ?? "equal",
      currency: parsed.data.currency ?? "TWD",
      ownerUserId: userId,
    })
    .returning();
  if (!group) return c.json({ error: "insert failed" }, 500);

  await db.insert(groupMembers).values({
    groupId: group.id,
    userId,
    role: "owner",
    joinedVia: "manual",
  });

  return c.json({ group });
});

app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!(await userInGroup(userId, id))) return c.json({ error: "forbidden" }, 403);

  const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  if (!group) return c.json({ error: "not found" }, 404);

  const members = await db
    .select({
      userId: groupMembers.userId,
      displayName: users.displayName,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, id));

  return c.json({ group, members });
});

const PatchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  defaultSplit: z.enum(["equal", "payer", "custom"]).optional(),
});

app.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!(await userIsOwner(userId, id))) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  await db
    .update(groups)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.defaultSplit !== undefined
        ? { defaultSplit: parsed.data.defaultSplit }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(groups.id, id));

  const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  return c.json({ group });
});

app.get("/:id/members", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!(await userInGroup(userId, id))) return c.json({ error: "forbidden" }, 403);

  const members = await db
    .select({
      userId: groupMembers.userId,
      displayName: users.displayName,
      role: groupMembers.role,
      joinedVia: groupMembers.joinedVia,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, id));

  return c.json({ members });
});

const AddMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["owner", "member"]).optional(),
});

app.post("/:id/members", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!(await userIsOwner(userId, id))) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = AddMemberSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const [member] = await db
    .insert(groupMembers)
    .values({
      groupId: id,
      userId: parsed.data.userId,
      role: parsed.data.role ?? "member",
      joinedVia: "manual",
    })
    .returning();

  return c.json({ member });
});

app.delete("/:id/members/:userId", async (c) => {
  const requesterId = c.get("userId");
  const id = c.req.param("id");
  const targetUserId = c.req.param("userId");
  if (!(await userIsOwner(requesterId, id))) return c.json({ error: "forbidden" }, 403);

  await db
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, targetUserId)));

  return c.json({ ok: true });
});

export default app;
