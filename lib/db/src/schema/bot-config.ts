import { pgTable, text, integer } from "drizzle-orm/pg-core";

export const botConfigTable = pgTable("bot_config", {
  id: integer("id").primaryKey().default(1),
  panelUrl: text("panel_url").notNull(),
  apiKey: text("api_key").notNull(),
  serverId: text("server_id").notNull(),
  backupIntervalMinutes: integer("backup_interval_minutes").notNull().default(5),
});

export type BotConfigRow = typeof botConfigTable.$inferSelect;
