import type { FastifyInstance } from 'fastify';
import { desc, isNull,eq,sql } from 'drizzle-orm';
import { db } from '../db';
import { businesses } from '../db/schema';
import { queues } from '../db/schema';
import bcrypt from 'bcryptjs';

interface businessBody {
  
  name: string;
  slug?: string;
  phone?:string;
  email?:string;
address?: string;
country?: string;
timezone?: string;
username: string;
  
  password: string;

}


export default async function  businessRoutes(app: FastifyInstance) {

// get all business 
  app.get('/businesses', async (request, reply) => {
  try {
    const rows = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        phone: businesses.phone,
        address: businesses.address,
        country: businesses.country,
        timezone: businesses.timezone,
        isActive: businesses.isActive,
        createdAt: businesses.createdAt,
        updatedAt: businesses.updatedAt,
        queueCount: sql<number>`count(${queues.id})::int`,
      })
      .from(businesses)
      .leftJoin(queues, eq(queues.businessId, businesses.id))
      .groupBy(businesses.id)
      .orderBy(businesses.createdAt);

    return reply.status(200).send(rows);
  } catch (error: any) {
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch businesses.' });
  }
});
 // add new business line  

app.post(
    '/businesses',
      async (request, reply) => {
      try {
        const body = request.body as businessBody;

     if (!body.name?.trim() || !body.phone?.trim() || !body.slug?.trim()) {
  return reply.status(400).send({ error: 'Business name, phone number, and slug are required.' });
}
const passwordHash = await bcrypt.hash(
  body.password,
  12,
);

const payload = {
  name: body.name.trim(),
  slug: body.slug.trim(),
  phone: body.phone.trim(),
  address: body.address?.trim() ?? null,
  country: body.country?.trim() ?? null,
  timezone: body.timezone?.trim() || 'UTC',
  email:"123@gmail.com",
  username:"123@gmail.com",
  passwordHash,
};
console.log('Inserting business:', payload); // <-- add this

const [newBusiness] = await db
  .insert(businesses)
  .values(payload)
  .returning();
      
        return reply.status(201).send(newBusiness);
     } catch (error: any) {
  console.error('Insert failed:', error.message, error.detail ?? '', error.code ?? '');
  app.log.error(error);
  return reply.status(500).send({ error: 'Failed to create business.' });
}
    }
  );

// put ==> update ......
 app.put(
    '/businesses/:id',
       async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const customerId = id;

        

        const body = request.body as businessBody;

        if (body.name !== undefined && !body.name?.trim()) {
          return reply.status(400).send({ error: 'Customer name cannot be empty.' });
        }
        if (body.phone !== undefined && !body.phone?.trim()) {
          return reply.status(400).send({ error: 'Phone number cannot be empty.' });
        }

        
        const updateData: Record<string, any> = {
          ...body,
          updatedAt: new Date(),
        };

        const [updatedCustomer] = await db
          .update(businesses)
          .set(updateData)
          .where(eq(businesses.id, customerId))
            
          
          .returning();

        if (!updatedCustomer) {
          return reply.status(404).send({ error: 'Customer not found.' });
        }

        return reply.status(200).send(updatedCustomer);
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({ error: 'Failed to update customer.' });
      }
    }
  );

// insert a queue ....

}
