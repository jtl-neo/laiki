import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { groups, groupMembers } from "../db/schema.js";

export async function getUserFundGroupIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: groups.id })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, userId), eq(groups.type, "fund")));
  return rows.map((r) => r.id);
}

export async function getAllFundAccountIds(): Promise<string[]> {
  const rows = await db
    .select({ id: groups.fundAccountId })
    .from(groups)
    .where(and(eq(groups.type, "fund"), isNotNull(groups.fundAccountId)));
  return rows.map((r) => r.id).filter((x): x is string => !!x);
}
