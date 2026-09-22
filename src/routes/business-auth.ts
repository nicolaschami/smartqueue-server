import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { db } from '../db';
import { businesses, queues } from '../db/schema';

type LoginBody = {
  username: string;
  password: string;
};

export default async function  businessAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginBody }>(
    '/business/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
            },
            password: {
              type: 'string',
              minLength: 1,
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const username = request.body.username.trim();
      const password = request.body.password;

      if (!username || !password) {
        return reply.code(400).send({
          error: 'Username and password are required.',
        });
      }

      // Find the business account by username.
      const businessRows = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          address: businesses.address,
          passwordHash: businesses.passwordHash,
          isActive: businesses.isActive,
        })
        .from(businesses)
        .where(eq(businesses.username, username))
        .limit(1);

      const business = businessRows[0];

      // Use the same message for unknown usernames and invalid passwords.
      if (!business || !business.isActive) {
        return reply.code(401).send({
          error: 'Invalid username or password.',
        });
      }
console.log('--- DEBUG INFO ---');
console.log('Username matched:', business?.name);
console.log('isActive value:', business?.isActive);
console.log('Stored DB Hash:', business?.passwordHash);
console.log('Postman Password:', password);
console.log('=============================================');
const passwordIsValid = await bcrypt.compare(password, business.passwordHash);
console.log('Compare Result:', passwordIsValid);

      if (!passwordIsValid) {
        return reply.code(401).send({
          error: 'Invalid username or password.',
        });
      }

      // Password is valid. Get all queues belonging to this business.
      const queueRows = await db
        .select({
          businessId: businesses.id,
          businessName: businesses.name,
          businessAddress: businesses.address,

          queueId: queues.id,
          queueName: queues.name,
          queueStatus: queues.status,
          nextNumber: queues.nextNumber,
        })
        .from(businesses)
        .innerJoin(
          queues,
          eq(businesses.id, queues.businessId),
        )
        .where(eq(businesses.id, business.id));

      return reply.code(200).send({
        business: {
          id: business.id,
          name: business.name,
          address: business.address,
        },
        queues: queueRows.map((row) => ({
          id: row.queueId,
          name: row.queueName,
          status: row.queueStatus,
          nextNumber: row.nextNumber,
        })),
      });
    },
  );
}