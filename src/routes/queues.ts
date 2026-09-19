import type { FastifyInstance } from 'fastify';
import { desc, isNull,eq ,and } from 'drizzle-orm';
import { db } from '../db';
import { businesses, queues,queueEntries } from '../db/schema';


// ------------------------------------------------------------
// POST /businesses/:businessId/queues — open a new queue for a business
// ------------------------------------------------------------
export default async function  queuesRoutes(app: FastifyInstance) {

app.post('/businesses/:businessId/queues', async (request, reply) => {
  try {
    const { businessId } = request.params as { businessId: string };
    const body = request.body as Partial<{ name: string; avgServiceMinutes: number }>;

    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
    if (!business) {
      return reply.status(404).send({ error: 'Business not found.' });
    }

    const insertData: typeof queues.$inferInsert = { businessId }; // <-- changed

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return reply.status(400).send({ error: 'Queue name cannot be empty.' });
      }
      insertData.name = body.name.trim();
    }

    if (body.avgServiceMinutes !== undefined) {
      if (!Number.isFinite(body.avgServiceMinutes) || body.avgServiceMinutes <= 0) {
        return reply.status(400).send({ error: 'avgServiceMinutes must be a positive number.' });
      }
      insertData.avgServiceMinutes = body.avgServiceMinutes;
    }

    const [newQueue] = await db.insert(queues).values(insertData).returning();
    return reply.status(201).send(newQueue);
  } catch (error: any) {
    console.error('Insert failed:', error.message, error.detail ?? '', error.code ?? '');
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to create queue.' });
  }
});


// ------------------------------------------------------------
// GET /businesses/:businessId/queues — list a business's queues
// optional ?status=open or ?status=closed to filter
// ------------------------------------------------------------
app.get('/businesses/:businessId/queuesold', async (request, reply) => {
  try {
    const { businessId } = request.params as { businessId: string };
    const { status } = request.query as { status?: 'open' | 'closed' };

    const conditions = [eq(queues.businessId, businessId)];
    if (status) {
      if (status !== 'open' && status !== 'closed') {
        return reply.status(400).send({ error: 'status must be "open" or "closed".' });
      }
      conditions.push(eq(queues.status, status));
    }

    const rows = await db
      .select()
      .from(queues)
      .where(and(...conditions))
      .orderBy(desc(queues.openedAt));

    return reply.status(200).send(rows);
  } catch (error: any) {
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch queues.' });
  }
});

// ------------------------------------------------------------
// PUT /queues/:id — update a queue (rename, change pace, open/close)
// ------------------------------------------------------------
app.put('/queues/:id', async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      name: string;
      avgServiceMinutes: number;
      status: 'open' | 'closed';
    }>;

    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return reply.status(400).send({ error: 'Queue name cannot be empty.' });
      }
      updateData.name = body.name.trim();
    }

    if (body.avgServiceMinutes !== undefined) {
      if (!Number.isFinite(body.avgServiceMinutes) || body.avgServiceMinutes <= 0) {
        return reply.status(400).send({ error: 'avgServiceMinutes must be a positive number.' });
      }
      updateData.avgServiceMinutes = body.avgServiceMinutes;
    }

    if (body.status !== undefined) {
      if (body.status !== 'open' && body.status !== 'closed') {
        return reply.status(400).send({ error: 'status must be "open" or "closed".' });
      }
      updateData.status = body.status;
      // Closing stamps closedAt; reopening clears it — handled explicitly here
      // rather than trusting the client to send the right closedAt value.
      updateData.closedAt = body.status === 'closed' ? new Date() : null;
    }

    if (Object.keys(updateData).length === 0) {
      return reply.status(400).send({ error: 'No fields provided to update.' });
    }

    const [updatedQueue] = await db
      .update(queues)
      .set(updateData)
      .where(eq(queues.id, id))
      .returning();

    if (!updatedQueue) {
      return reply.status(404).send({ error: 'Queue not found.' });
    }

    return reply.status(200).send(updatedQueue);
  } catch (error: any) {
    console.error('Update failed:', error.message, error.detail ?? '', error.code ?? '');
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to update queue.' });
  }
});
app.patch('/queues/:id/status', async (request, reply ) => {
  try {
    const { id } = request.params as { id: string };
    const { status } = request.body as {
      status?: 'open' | 'closed';
    };

    if (status !== 'open' && status !== 'closed') {
      return reply.status(400).send({
        error: 'status must be "open" or "closed".',
      });
    }

    const [updatedQueue] = await db
      .update(queues)
      .set({
        status,
        closedAt: status === 'closed' ? new Date() : null,
      })
      .where(eq(queues.id, id))
      .returning();

    if (!updatedQueue) {
      return reply.status(404).send({
        error: 'Queue not found.',
      });
    }

    return reply.status(200).send({
      ...updatedQueue,
      queuename: updatedQueue.name, 
    });
  } catch (error: any) {
    app.log.error(error);
    return reply.status(500).send({
      error: 'Failed to update queue status.',
    });
  }
});

app.get('/businesses/:businessId/queues', async (request, reply) => {
  try {
    const { businessId } = request.params as { businessId: string };
    const { status } = request.query as { status?: 'open' | 'closed' };

    if (status && status !== 'open' && status !== 'closed') {
      return reply.status(400).send({ error: 'status must be "open" or "closed".' });
    }

    const conditions = [eq(queues.businessId, businessId)];
    if (status) {
      conditions.push(eq(queues.status, status));
    }

    const rows = await db
      .select({
        id: queues.id,
        status: queues.status,
        openedAt: queues.openedAt,
        closedAt: queues.closedAt,
        avgServiceMinutes: queues.avgServiceMinutes,
        businessId: queues.businessId,
        queuename :queues.name,
        businessName: businesses.name,
        businessPhone: businesses.phone,
        businessCountry: businesses.country,
      })
      .from(queues)
      .innerJoin(businesses, eq(queues.businessId, businesses.id))
      .where(and(...conditions))
      .orderBy(desc(queues.openedAt));

    return reply.status(200).send(rows);
  } catch (error: any) {
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch queues.' });
  }
});


  app.get('/queues/:queueId/dashboard', async (request, reply) => {
    try {
      const { queueId } = request.params as { queueId: string };

      // 1. Fetch Queue and Business details
      const [queueDetails] = await db
        .select({
          id: queues.id,
          status: queues.status,
          avgServiceMinutes: queues.avgServiceMinutes,
          businessName: businesses.name,
        })
        .from(queues)
        .innerJoin(businesses, eq(queues.businessId, businesses.id))
        .where(eq(queues.id, queueId));

      if (!queueDetails) {
        return reply.status(404).send({ error: 'Queue not found.' });
      }

      // 2. Fetch all entries for this queue
      const entries = await db
        .select()
        .from(queueEntries)
        .where(eq(queueEntries.queueId, queueId));

      // 3. Compute Stats
      const waitingList = entries
        .filter((e) => e.status === 'waiting')
        .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()); // Oldest first

      const servedToday = entries.filter((e) => e.status === 'served').length;
      const nowServing = entries.find((e) => e.status === 'called') || null;

      // 4. Format the response to match the frontend DashboardData interface
      const dashboardData = {
        queueId: queueDetails.id,
        businessName: queueDetails.businessName,
        isOpen: queueDetails.status === 'open',
        stats: {
          waitingCount: waitingList.length,
          avgWaitMin: queueDetails.avgServiceMinutes || 0,
          servedToday,
        },
        nowServing: nowServing ? {
          id: nowServing.id,
          number: nowServing.numberLabel,
          customerName: nowServing.customerName,
          status: nowServing.status,
          joinedAt: nowServing.joinedAt,
        } : null,
        waitingList: waitingList.map((e) => ({
          id: e.id,
          number: e.numberLabel,
          customerName: e.customerName,
          status: e.status,
          joinedAt: e.joinedAt,
        })),
      };

      return reply.status(200).send(dashboardData);
    } catch (error: any) {
      app.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch queue dashboard data.' });
    }
  });

// inseert into notificcation 




// end 


}