import webpush from 'web-push';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';
import  businessesRoutes  from './routes/businesses.js';
import queuesRoutes from './routes/queues.js';
import queuesentriesRoutes from './routes/queue_entries.js'
import notificationRouts from './routes/notification.js'
export function buildApp() {
  const app = Fastify({
    logger: true,
  });


  
  app.register(cors, {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://smartqueue-frontendv1.vercel.app',
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  } );
 
  app.register(healthRoutes, {prefix: '/api'});
  app.register(businessesRoutes, {prefix: '/api'});
  app.register(queuesRoutes, {prefix: '/api'});
  app.register(queuesentriesRoutes, {prefix: '/api'});
  app.register(notificationRouts, {prefix: '/api'});
    webpush.setVapidDetails(
    'mailto:nicolaschamy@gmail.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  return app;
}
