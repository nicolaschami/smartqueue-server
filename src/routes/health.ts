import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_request, reply) => {
    try {
      await db.execute(sql`select now()`);

      return reply.send({
        success: true,
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      app.log.error(error);

      return reply.status(503).send({
        success: false,
        status: 'error',
        database: 'unavailable',
      });
    }
  });
}
