import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { groups, groupMembers, accounts } from "../db/schema.js";

export async function ensureUserDefaults(userId: string): Promise<void> {
  const [m] = await db
    .select()
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);
  if (!m) {
    const [g] = await db
      .insert(groups)
      .values({ type: "shared", name: "我的記帳", ownerUserId: userId })
      .returning();
    if (g) {
      await db.insert(groupMembers).values({
        groupId: g.id,
        userId,
        role: "owner",
        joinedVia: "manual",
      });
    }
  }

  const [a] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);
  if (!a) {
    await db.insert(accounts).values({ userId, name: "錢包現金", type: "cash" });
  }
}
