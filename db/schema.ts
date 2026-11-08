import { pgTable, text, primaryKey, timestamp } from 'drizzle-orm/pg-core'

export const favorites = pgTable(
  'wallet_favorites',
  {
    wallet: text('wallet').notNull(),
    pool: text('pool').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.wallet, table.pool] })],
)
