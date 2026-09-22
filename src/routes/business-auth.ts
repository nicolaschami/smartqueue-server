import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { db } from '../db';
import { businesses, queues } from '../db/schema';

type LoginBody = {
  username: string;
  password: string;
};

type ResetPasswordBody = {
  username: string;
  newPassword: string;
};

export default async function businessAuthRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------------
  // TEMPORARY: Route to fix/update invalid password hashes in the DB
  // ------------------------------------------------------------------
  app.post<{ Body: ResetPasswordBody }>(
    '/business/reset-password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'newPassword'],
          properties: {
            username: { type: 'string', minLength: 1 },
            newPassword: { type: 'string', minLength: 1 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const username = request.body.username.trim();
      const newPassword = request.body.newPassword;

      // Generate a fresh, valid bcrypt hash
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update the hash in Drizzle ORM
      const updatedRows = await db
        .update(businesses)
        .set({ passwordHash: newPasswordHash })
        .where(eq(businesses.username, username))
        .returning({ id: businesses.id, name: businesses.name });

      if (updatedRows.length === 0) {
        return reply.code(404).send({ error: 'Business username not found.' });
      }

      return reply.code(200).send({
        message: 'Password successfully re-hashed and updated in the database.',
        business: updatedRows[0],
      });
    }
  );

  // ------------------------------------------------------------------
  // LOGIN ROUTE
  // ------------------------------------------------------------------
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
          slug : businesses.slug,
          phone : businesses.phone,
          country: businesses.country,
          timezone: businesses.timezone,
          email: businesses.email
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
      console.log('==============***************===============================');  
      console.log('--- DEBUG INFO ---');
      console.log('Username matched:', business.name);
      console.log('isActive value:', business.isActive);
      console.log('Stored DB Hash:', business.passwordHash);
      console.log('Postman Password:', password);
      console.log('==============***************===============================');

      console.log('==============***************===============================');

const hardcodedCheck = await bcrypt.compare('LP112233.lp', business.passwordHash);
console.log('Hardcoded test result:', hardcodedCheck); // WILL RETURN TRUE

const realCheck = await bcrypt.compare(password, business.passwordHash);
console.log('Incoming body test result:', realCheck); // RETURNING FALSE
      console.log('==============***************===============================');

      console.log('==============***************===============================Level2');

// Correct usage in an async function:
const generatedHash = await bcrypt.hash('LP112233.lp', 10);
console.log('Newly Generated Hash:', generatedHash);

// Test comparison directly in console:
const testResult = await bcrypt.compare('LP112233.lp', generatedHash);
console.log('Direct Comparison Check:', testResult); // Outputs: true
console.log('==============***************===============================Level2');

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
          businessSlug:businesses.slug,
          businessphone : businesses.phone,
          businesscountry: businesses.country,
          businesstimezone: businesses.timezone,
          businessemail: businesses.email,

          queueId: queues.id,
          queueName: queues.name,
          queueStatus: queues.status,
          nextNumber: queues.nextNumber,
          averageservicem : queues.avgServiceMinutes
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