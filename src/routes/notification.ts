import { FastifyInstance } from 'fastify';
import { supabase } from '../lib/supabase';
import webpush from 'web-push';
export default async function notificationRoutes(
  app: FastifyInstance
) {
  app.post('/notifications/subscribe', async (request, reply) => {
    try {
     const body = request.body as {
  queueEntryId?: string;
  permission?: string;
  subscription?: object;
};

      if (!body.queueEntryId) {
        return reply.code(400).send({
          error: 'queueEntryId is required',
        });
      }

      if (body.permission !== 'granted') {
        return reply.code(400).send({
          error: 'Notification permission was not granted',
        });
      }

      // INSERT INTO Supabase
      const { data, error } = await supabase
        .from('customer_notifications')
       .insert({
  queue_entry_id: body.queueEntryId,
  enabled: true,
  push_subscription: body.subscription,
})
        .select()
        .single();

      if (error) {
  app.log.error(error, 'SUPABASE NOTIFICATION ERROR');

  return reply.code(500).send({
    error: 'Failed to save notification preference',
    details: error.message,
    code: error.code,
    hint: error.hint,
    detailsFromSupabase: error.details,
  });
}

      return reply.code(201).send({
        success: true,
        notification: data,
      });

    } catch (error) {
      app.log.error(error);

      return reply.code(500).send({
        error: 'Failed to save notification subscription',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

app.post('/notifications/test-push', async (request, reply) => {
  try {
    const body = request.body as {
      queueEntryId?: string;
    };

    if (!body.queueEntryId) {
      return reply.code(400).send({
        error: 'queueEntryId is required',
      });
    }

    const { data, error } = await supabase
      .from('customer_notifications')
      .select('push_subscription')
      .eq('queue_entry_id', body.queueEntryId)
      .eq('enabled', true)
      .single();

    if (error || !data?.push_subscription) {
      return reply.code(404).send({
        error: 'Push subscription not found',
      });
    }

    await webpush.sendNotification(
      data.push_subscription,
      JSON.stringify({
        title: 'Queue Update 🔔',
        body: "You're next! Please get ready.",
      })
    );

    return reply.send({
      success: true,
    });
  } catch (error) {
    app.log.error(error);

    return reply.code(500).send({
      error: 'Failed to send push notification',
    });
  }
});


}