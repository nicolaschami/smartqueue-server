import { int } from 'drizzle-orm/mysql-core';
import {
  boolean,
  integer,
  pgEnum,
  pgSchema,
  timestamp,
  uuid,
  varchar,
  index,
text  
} from 'drizzle-orm/pg-core';

export const smartqueue = pgSchema('smartqueue');
export const entryStatusEnum = smartqueue.enum('entry_status', [
  'waiting',
  'called',
  'served',
  'cancelled',
]);
export const queueStatusEnum = smartqueue.enum('queue_status', [
  'open',
  'closed',
]);

export const businesses = smartqueue.table('businesses', {
  id: uuid('id').defaultRandom().primaryKey(),

  name: varchar('name', { length: 150 }).notNull(),

  slug: varchar('slug', { length: 150 }).notNull().unique(),

  phone: varchar('phone', { length: 30 }),

  address: varchar('address', { length: 255 }),

  country: varchar('country', { length: 2 }),

  timezone: varchar('timezone', { length: 60 })
    .notNull()
    .default('UTC'),

  isActive: boolean('is_active')
    .notNull()
    .default(true),

  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'date',
  })
    .notNull()
    .defaultNow(),
    
});

export const staff = smartqueue.table('staff', {
  id: uuid('id').defaultRandom().primaryKey(),

  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, {
      onDelete: 'cascade',
    }),

  name: varchar('name', { length: 150 }).notNull(),

  email: varchar('email', { length: 255 })
    .notNull()
    .unique(),

  passwordHash: varchar('password_hash', {
    length: 255,
  }).notNull(),

  role: varchar('role', { length: 30 })
    .notNull()
    .default('owner'),

  isActive: boolean('is_active')
    .notNull()
    .default(true),

  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  })
    .notNull()
    .defaultNow(),
});

export const queues = smartqueue.table('queues', {
  id: uuid('id').defaultRandom().primaryKey(),

  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, {
      onDelete: 'cascade',
    }),

  name: varchar('name', { length: 100 })
    .notNull()
    .default('Main queue'),

  status: queueStatusEnum('status')
    .notNull()
    .default('open'),

  avgServiceMinutes: integer('avg_service_minutes')
    .notNull()
    .default(10),

  nextNumber: integer('next_number')
    .notNull()
    .default(1),

  openedAt: timestamp('opened_at', {
    withTimezone: true,
    mode: 'date',
  })
    .notNull()
    .defaultNow(),

  closedAt: timestamp('closed_at', {
    withTimezone: true,
    mode: 'date',
  }),
});
export const queueEntries = smartqueue.table(
  'queue_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    queueId: uuid('queue_id')
      .notNull()
      .references(() => queues.id, {
        onDelete: 'cascade',
      }),

    numberLabel: varchar('number_label', {
      length: 10,
    }).notNull(),

    customerName: varchar('customer_name', {
      length: 150,
    }),

    customerPhone: varchar('customer_phone', {
      length: 30,
    }),

    status: entryStatusEnum('status')
      .notNull()
      .default('waiting'),

    joinedAt: timestamp('joined_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),

    calledAt: timestamp('called_at', {
      withTimezone: true,
      mode: 'date',
    }),

    servedAt: timestamp('served_at', {
      withTimezone: true,
      mode: 'date',
    }),

    cancelledAt: timestamp('cancelled_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => ({
    queueIdIndex: index('idx_queue_entries_queue_id').on(
      table.queueId,
    ),

    statusIndex: index('idx_queue_entries_status').on(
      table.status,
    ),

    queueStatusJoinedIndex: index(
      'idx_queue_entries_queue_status_joined',
    ).on(
      table.queueId,
      table.status,
      table.joinedAt,
    ),
  }),
);


export const pushSubscriptions = smartqueue.table(
  'push_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    queueEntryId: uuid('queue_entry_id')
      .notNull()
      .references(() => queueEntries.id, {
        onDelete: 'cascade',
      }),

    endpoint: text('endpoint').notNull(),

    p256dhKey: text('p256dh_key').notNull(),

    authKey: text('auth_key').notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    queueEntryIdIndex: index(
      'idx_push_subscriptions_entry_id',
    ).on(table.queueEntryId),
  }),
);

