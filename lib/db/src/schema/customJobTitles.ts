import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Remembered custom job titles typed for the "Other" job role — the suggestion
// list offered whenever someone types a custom title. Deduped case-insensitively
// via the unique index on lower(title); the first-typed casing is kept for
// display.
export const customJobTitlesTable = pgTable(
  "custom_job_titles",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("custom_job_titles_title_lower").on(sql`lower(${t.title})`)],
);

export type CustomJobTitle = typeof customJobTitlesTable.$inferSelect;
