import type { FastifyInstance } from 'fastify';
import { eq, and, asc, sql } from 'drizzle-orm';
import { queues, queueEntries } from '../db/schema.js'; // <-- adjust this path if schema.ts lives elsewhere
import { db } from '../db';                       // <-- adjust to wherever your Drizzle client is created
import webpush from 'web-push';
import { supabase } from '../lib/supabase.js';
const formatNumberLabel = (n: number) => `A${String(n).padStart(3, '0')}`;

// ------------------------------------------------------------
// POST /queues/:queueId/entries — customer scans the QR and joins
// ------------------------------------------------------------
export default async function  queuesentriesRoutes(app: FastifyInstance) {
app.post('/queues/:queueId/entries', async (request, reply) => {
  try {
    const { queueId } = request.params as { queueId: string };
    const body = request.body as Partial<{ customerName: string; customerPhone: string }>;

    type JoinResult =
      | { ok: false; status: number; message: string }
      | { ok: true; entry: typeof queueEntries.$inferSelect; position: number };

    const result: JoinResult = await db.transaction(async (tx) => {
      // Lock the queue row so two simultaneous scans can't read the
      // same nextNumber and hand out duplicate ticket numbers.
      const [queue] = await tx
        .select()
        .from(queues)
        .where(eq(queues.id, queueId))
        .for('update');

      if (!queue) {
        return { ok: false, status: 404, message: 'Queue not found.' };
      }
      if (queue.status !== 'open') {
        return { ok: false, status: 400, message: 'This queue is currently closed.' };
      }

      const assignedNumber = queue.nextNumber;

      await tx
        .update(queues)
        .set({ nextNumber: assignedNumber + 1 })
        .where(eq(queues.id, queueId));

      const insertData: typeof queueEntries.$inferInsert = {
        queueId,
        numberLabel: formatNumberLabel(assignedNumber),
        customerName: body.customerName?.trim() || null,
        customerPhone: body.customerPhone?.trim() || null,
      };

      const [newEntry] = await tx.insert(queueEntries).values(insertData).returning();

      // People ahead of this one right now, for the customer's
      // "you're #N" screen.
      const [{ ahead }] = await tx
        .select({ ahead: sql<number>`count(*)::int` })
        .from(queueEntries)
        .where(
          and(
            eq(queueEntries.queueId, queueId),
            eq(queueEntries.status, 'waiting'),
            sql`${queueEntries.joinedAt} < ${newEntry.joinedAt}`
          )
        );

      return { ok: true, entry: newEntry, position: ahead + 1 };
    });

    if (!result.ok) {
      return reply.status(result.status).send({ error: result.message });
    }

    return reply.status(201).send({ entry: result.entry, position: result.position });
  } catch (error: any) {
    console.error('Join queue failed:', error.message, error.detail ?? '', error.code ?? '');
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to join queue.' });
  }
});
// ------------------------------------------------------------
// POST /queues/:queueId/call-next — mark the currently "called" entry
// as served, then call the next person waiting
// ------------------------------------------------------------
app.post('/queues/:queueId/call-next', async (request, reply) => {
  try {
    const { queueId } = request.params as { queueId: string };

    type CallNextResult =
      | {
          ok: false;
          status: number;
          message: string;
        }
      | {
          ok: true;
          servedEntry: typeof queueEntries.$inferSelect | null;
          calledEntry: typeof queueEntries.$inferSelect | null;
        };

    const result: CallNextResult = await db.transaction(async (tx) => {
      const [queue] = await tx
        .select()
        .from(queues)
        .where(eq(queues.id, queueId))
        .for('update');

      if (!queue) {
        return {
          ok: false,
          status: 404,
          message: 'Queue not found.',
        };
      }

      const [currentlyCalled] = await tx
        .select()
        .from(queueEntries)
        .where(
          and(
            eq(queueEntries.queueId, queueId),
            eq(queueEntries.status, 'called')
          )
        );

      let servedEntry: typeof queueEntries.$inferSelect | null = null;

      if (currentlyCalled) {
        const [updated] = await tx
          .update(queueEntries)
          .set({
            status: 'served',
            servedAt: new Date(),
          })
          .where(eq(queueEntries.id, currentlyCalled.id))
          .returning();

        servedEntry = updated;
      }

      const [nextWaiting] = await tx
        .select()
        .from(queueEntries)
        .where(
          and(
            eq(queueEntries.queueId, queueId),
            eq(queueEntries.status, 'waiting')
          )
        )
        .orderBy(asc(queueEntries.joinedAt))
        .limit(1);

      let calledEntry: typeof queueEntries.$inferSelect | null = null;

      if (nextWaiting) {
        const [updated] = await tx
          .update(queueEntries)
          .set({
            status: 'called',
            calledAt: new Date(),
          })
          .where(eq(queueEntries.id, nextWaiting.id))
          .returning();

        calledEntry = updated;
      }

      return {
        ok: true,
        servedEntry,
        calledEntry,
      };
    });

    if (!result.ok) {
      return reply.status(result.status).send({
        error: result.message,
      });
    }
console.log('🚨 REACHED AFTER TRANSACTION');
console.log('🚨 RESULT:', result);
if (result.calledEntry) {
  console.log(
    '🔔 Customer is now NEXT:',
    result.calledEntry.id
  );

  try {
    const { data: notification, error } = await supabase
      .from('customer_notifications')
      .select('push_subscription, notified_next')
      .eq('queue_entry_id', result.calledEntry.id)
      .eq('enabled', true)
      .single();

    if (error) {
      console.error('❌ Failed to find notification:', error);
    } else if (!notification?.push_subscription) {
      console.log('ℹ️ Customer has no push subscription.');
    } else if (notification.notified_next) {
      console.log('ℹ️ Customer was already notified.');
    } else {
      await webpush.sendNotification(
        notification.push_subscription,
        JSON.stringify({
          title: 'Queue Update 🔔',
          body: "You're next! Please get ready.",
        })
      );

      await supabase
        .from('customer_notifications')
        .update({
          notified_next: true,
          notified_at: new Date().toISOString(),
        })
        .eq('queue_entry_id', result.calledEntry.id)
        .eq('enabled', true);

      console.log('✅ Push notification sent!');
    }
  } catch (error) {
    console.error('❌ Push notification failed:', error);
  }
}

    return reply.status(200).send({
      servedEntry: result.servedEntry,
      calledEntry: result.calledEntry,
    });
  } catch (error: any) {
    console.error(
      'Call next failed:',
      error.message,
      error.detail ?? '',
      error.code ?? ''
    );

    app.log.error(error);

    return reply.status(500).send({
      error: 'Failed to call next customer.',
    });
  }
});
// ------------------------------------------------------------
// PUT /queue-entries/:id — manual status change from the dashboard
// (e.g. the "No-show" button on a waiting entry in QueueBoard.tsx)
// Uses "cancelled" since this schema has no separate no_show value.
// ------------------------------------------------------------
app.put('/queue-entries/:id', async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: 'served' | 'cancelled' } | undefined;

    if (!body || (body.status !== 'served' && body.status !== 'cancelled')) {
      return reply.status(400).send({ error: 'status must be "served" or "cancelled".' });
    }

    const updateData =
      body.status === 'served'
        ? { status: 'served' as const, servedAt: new Date() }
        : { status: 'cancelled' as const, cancelledAt: new Date() };

    const [updatedEntry] = await db
      .update(queueEntries)
      .set(updateData)
      .where(eq(queueEntries.id, id))
      .returning();

    if (!updatedEntry) {
      return reply.status(404).send({ error: 'Queue entry not found.' });
    }

    return reply.status(200).send(updatedEntry);
  } catch (error: any) {
    console.error('Update entry failed:', error.message, error.detail ?? '', error.code ?? '');
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to update queue entry.' });
  }
});
}