import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const answerEvents = sqliteTable("answer_events", {
  userId: text("user_id").notNull(),
  id: text("id").notNull(),
  questionId: text("question_id").notNull(),
  response: text("response").notNull(),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  answeredAt: text("answered_at").notNull(),
}, table => [primaryKey({ columns: [table.userId, table.id] })]);

export const bankModules = sqliteTable("bank_modules", {
  id: text("id").primaryKey(),
  position: integer("position").notNull(),
  version: text("version").notNull(),
  content: text("content").notNull(),
});
