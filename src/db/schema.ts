import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
export * from "./auth-schema";
import { user } from "./auth-schema";

/** One row per AI call — the source of truth for monthly quotas. */
export const usageEvent = pgTable(
  "usage_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    ipHash: text("ip_hash").notNull(),
    kind: text("kind").notNull(), // "generate" | "refine"
    projectId: text("project_id").notNull(),
    stackId: text("stack_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("usage_user_idx").on(t.userId, t.createdAt), index("usage_ip_idx").on(t.ipHash, t.createdAt)]
);

/** Saved projects (history) — members, demo admins and admins only. */
export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    stackId: text("stack_id").notNull(),
    title: text("title").notNull(),
    files: jsonb("files").$type<Record<string, string>>().notNull(),
    messages: jsonb("messages").$type<{ role: string; content: string }[]>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("project_user_idx").on(t.userId, t.updatedAt)]
);
