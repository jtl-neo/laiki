import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts, groupMembers, groups, users } from "../db/schema.js";
import { resolvePersonalGroupId } from "./ensureDefaults.js";

/**
 * DM-managed groups (帳本): created from the 1-on-1 chat, members linked
 * from the owner's friend list (shadow or bound users). No LINE group
 * involved — lineGroupId stays NULL; the personal group is excluded by id.
 */

export type DmGroup = {
  id: string;
  name: string;
  type: "shared" | "fund" | "split";
  isOwner: boolean;
  memberCount: number;
};

export async function createDmGroup(
  ownerUserId: string,
  name: string,
  kind: "split" | "fund",
): Promise<{ groupId: string }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("createDmGroup: empty name");

  return db.transaction(async (tx) => {
    let fundAccountId: string | null = null;
    if (kind === "fund") {
      const [account] = await tx
        .insert(accounts)
        .values({ userId: ownerUserId, name: `${trimmed} 基金池`, type: "cash", icon: "🏦" })
        .returning();
      fundAccountId = account?.id ?? null;
      if (!fundAccountId) throw new Error("createDmGroup: fund account failed");
    }
    const [g] = await tx
      .insert(groups)
      .values({
        type: kind,
        name: trimmed,
        ownerUserId,
        fundAccountId,
      })
      .returning();
    if (!g) throw new Error("createDmGroup: insert failed");
    await tx
      .insert(groupMembers)
      .values({ groupId: g.id, userId: ownerUserId, role: "owner", joinedVia: "manual" });
    return { groupId: g.id };
  });
}

/** All DM groups the user belongs to, excluding their personal group. */
export async function listDmGroups(userId: string): Promise<DmGroup[]> {
  const personalGroupId = await resolvePersonalGroupId(userId);
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      type: groups.type,
      ownerUserId: groups.ownerUserId,
      memberCount: sql<string>`(
        select count(*) from group_members gm2 where gm2.group_id = ${groups.id}
      )`,
    })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .where(
      and(
        eq(groupMembers.userId, userId),
        isNull(groups.lineGroupId),
        ne(groups.id, personalGroupId),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    isOwner: r.ownerUserId === userId,
    memberCount: Number(r.memberCount),
  }));
}

export type GroupMemberCandidate = {
  userId: string;
  displayName: string | null;
  isVirtual: boolean;
  inGroup: boolean;
  isOwner: boolean;
};

/**
 * The owner's friends (shadow + bound) overlaid with current membership —
 * drives the member-manage toggle card.
 */
export async function listMemberCandidates(
  ownerUserId: string,
  groupId: string,
): Promise<GroupMemberCandidate[]> {
  const [friends, members] = await Promise.all([
    db
      .select({ userId: users.id, displayName: users.displayName, isVirtual: users.isVirtual })
      .from(users)
      .where(eq(users.createdBy, ownerUserId)),
    db
      .select({ userId: groupMembers.userId, role: groupMembers.role })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId)),
  ]);
  const memberSet = new Map(members.map((m) => [m.userId, m.role]));
  return friends.map((f) => ({
    userId: f.userId,
    displayName: f.displayName,
    isVirtual: f.isVirtual,
    inGroup: memberSet.has(f.userId),
    isOwner: memberSet.get(f.userId) === "owner",
  }));
}

export type ToggleResult =
  | { ok: true; added: boolean }
  | { ok: false; error: "forbidden" | "not_friend" | "owner_immutable" };

/**
 * Owner-only: add/remove one of their friends as a group member.
 * The friend must belong to the owner's roster (created_by = owner).
 */
export async function toggleGroupMember(
  ownerUserId: string,
  groupId: string,
  friendUserId: string,
): Promise<ToggleResult> {
  const [g] = await db
    .select({ ownerUserId: groups.ownerUserId })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!g || g.ownerUserId !== ownerUserId) return { ok: false, error: "forbidden" };
  if (friendUserId === ownerUserId) return { ok: false, error: "owner_immutable" };

  const [friend] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, friendUserId), eq(users.createdBy, ownerUserId)))
    .limit(1);
  if (!friend) return { ok: false, error: "not_friend" };

  const [existing] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, friendUserId)))
    .limit(1);

  if (existing) {
    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, friendUserId)));
    return { ok: true, added: false };
  }
  await db
    .insert(groupMembers)
    .values({ groupId, userId: friendUserId, role: "member", joinedVia: "manual" })
    .onConflictDoNothing();
  return { ok: true, added: true };
}
