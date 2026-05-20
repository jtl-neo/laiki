import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  date,
  pgEnum,
  primaryKey,
  customType,
  jsonb,
  unique,
  boolean,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const groupTypeEnum = pgEnum("group_type", ["shared", "fund", "split"]);
export const splitMethodEnum = pgEnum("split_method", ["equal", "payer", "custom"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "member"]);
export const joinedViaEnum = pgEnum("joined_via", ["invite", "line_group", "manual"]);
export const accountTypeEnum = pgEnum("account_type", [
  "cash",
  "debit",
  "credit",
  "bank",
  "ewallet",
]);
export const txKindEnum = pgEnum("tx_kind", [
  "expense",
  "income",
  "transfer",
  "fund_in",
  "fund_out",
]);
export const txSourceEnum = pgEnum("tx_source", [
  "manual",
  "line_text",
  "line_image",
  "liff",
]);
export const apiKeyProviderEnum = pgEnum("api_key_provider", [
  "gemini",
  "openai",
  "anthropic",
  "ollama",
]);
export const accountMemberRoleEnum = pgEnum("account_member_role", ["owner", "editor"]);
export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  lineUserId: text("line_user_id").notNull().unique(),
  displayName: text("display_name"),
  pictureUrl: text("picture_url"),
  email: text("email"),
  locale: text("locale").notNull().default("zh-TW"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: groupTypeEnum("type").notNull().default("shared"),
  name: text("name").notNull(),
  lineGroupId: text("line_group_id").unique(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  defaultSplit: splitMethodEnum("default_split").notNull().default("equal"),
  currency: text("currency").notNull().default("TWD"),
  fundAccountId: uuid("fund_account_id").references(() => accounts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    joinedVia: joinedViaEnum("joined_via").notNull().default("invite"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.userId] }),
  }),
);

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull().default("cash"),
  last4: text("last4"),
  currency: text("currency").notNull().default("TWD"),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull().default("0"),
  initialBalance: numeric("initial_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  icon: text("icon"),
  color: text("color"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountMembers = pgTable(
  "account_members",
  {
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: accountMemberRoleEnum("role").notNull().default("editor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.accountId, t.userId] }),
  }),
);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  txDate: date("tx_date").notNull(),
  paidByUserId: uuid("paid_by_user_id").notNull().references(() => users.id, {
    onDelete: "restrict",
  }),
  category: text("category"),
  kind: txKindEnum("kind").notNull().default("expense"),
  note: text("note"),
  source: txSourceEnum("source").notNull().default("manual"),
  aiConfidence: numeric("ai_confidence", { precision: 4, scale: 3 }),
  transferPairId: uuid("transfer_pair_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactionSplits = pgTable(
  "transaction_splits",
  {
    transactionId: uuid("transaction_id").notNull().references(() => transactions.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.transactionId, t.userId] }),
  }),
);

export const settlements = pgTable("settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  fromUserId: uuid("from_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  toUserId: uuid("to_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  fromAccountId: uuid("from_account_id").references(() => accounts.id, { onDelete: "set null" }),
  toAccountId: uuid("to_account_id").references(() => accounts.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
});

export const userApiKeys = pgTable(
  "user_api_keys",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: apiKeyProviderEnum("provider").notNull(),
    encryptedKey: bytea("encrypted_key").notNull(),
    encryptionIv: bytea("encryption_iv").notNull(),
    keyHint: text("key_hint").notNull(),
    endpoint: text("endpoint"),
    model: text("model"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.provider] }),
  }),
);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultProvider: apiKeyProviderEnum("default_provider"),
  notifyWeekly: boolean("notify_weekly").notNull().default(true),
  notifyMonthly: boolean("notify_monthly").notNull().default(true),
  notifyNudge: boolean("notify_nudge").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    parseCount: integer("parse_count").notNull().default(0),
    recognizeCount: integer("recognize_count").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.month] }),
  }),
);

export const aiInsights = pgTable("ai_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  insights: jsonb("insights").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
  category: text("category"),
  monthlyLimit: numeric("monthly_limit", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recurringTransactions = pgTable("recurring_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  kind: txKindEnum("kind").notNull().default("expense"),
  category: text("category"),
  note: text("note"),
  frequency: recurringFrequencyEnum("frequency").notNull(),
  anchorDay: integer("anchor_day"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  nextRunDate: date("next_run_date").notNull(),
  lastRunDate: date("last_run_date"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
