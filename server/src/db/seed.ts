import { db, sql } from "./client.js";
import { users, groups, groupMembers, accounts } from "./schema.js";

async function main() {
  const [u] = await db
    .insert(users)
    .values({
      lineUserId: "U_dev_seed_user",
      displayName: "Dev User",
      locale: "zh-TW",
    })
    // No explicit conflict target: line_user_id uniqueness is now a partial
    // index (WHERE line_user_id IS NOT NULL), which plain column-target
    // inference can't use as an arbiter.
    .onConflictDoNothing()
    .returning();

  if (!u) {
    console.log("seed: user already exists, skip");
    await sql.end();
    return;
  }

  const [g] = await db
    .insert(groups)
    .values({
      type: "shared",
      name: "我的記帳",
      ownerUserId: u.id,
    })
    .returning();

  await db.insert(groupMembers).values({
    groupId: g!.id,
    userId: u.id,
    role: "owner",
    joinedVia: "manual",
  });

  await db.insert(accounts).values([
    { userId: u.id, name: "錢包現金", type: "cash" },
    { userId: u.id, name: "LINE Pay", type: "ewallet" },
  ]);

  console.log("seed: ok user=%s group=%s", u.id, g!.id);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
