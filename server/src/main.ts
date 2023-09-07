import { randomUUID } from 'crypto';

import dotenv from 'dotenv';
dotenv.config();

import fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyIO from 'fastify-socket.io';
import { Redis } from 'ioredis';
import closeWithGrace from 'close-with-grace';

const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;

const CONNECTION_COUNT_KEY = 'chat:connection-count';
const CONNECTION_COUNT_UPDATED_CHANNEL = 'chat:connection-count-updated';
const NEW_MESSAGE_CHANNEL = 'chat:new-message';

if (!UPSTASH_REDIS_REST_URL) {
  console.error('Missing UPSTASH_REDIS_REST_URL');
  process.exit(1);
}

// Redis publisher and subscriber
const PUBLISHER = new Redis(UPSTASH_REDIS_REST_URL);
const SUBSCRIBER = new Redis(UPSTASH_REDIS_REST_URL);

let connectedClients = 0;

async function buildServer() {
  const app = fastify();

  // Register Middlewares
  // Await since register returns a promise
  // CORS
  await app.register(fastifyCors, {
    origin: CORS_ORIGIN,
  });
  // Socket.io
  await app.register(fastifyIO);

  const currentCount = await PUBLISHER.get(CONNECTION_COUNT_KEY);

  if (!currentCount) {
    await PUBLISHER.set(CONNECTION_COUNT_KEY, 0);
  }

  app.io.on('connection', async (io) => {
    console.log('Client connected');

    const incrResult = await PUBLISHER.incr(CONNECTION_COUNT_KEY);

    connectedClients++;

    await PUBLISHER.publish(
      CONNECTION_COUNT_UPDATED_CHANNEL,
      String(incrResult)
    );

    io.on(NEW_MESSAGE_CHANNEL, async (payload) => {
      const message = payload.message;

      if (!message) {
        return;
      }

      console.log(message);

      await PUBLISHER.publish(NEW_MESSAGE_CHANNEL, message.toString());
    });

    io.on('disconnect', async () => {
      console.log('Client disconnected');

      const decrResult = await PUBLISHER.decr(CONNECTION_COUNT_KEY);

      connectedClients--;

      await PUBLISHER.publish(
        CONNECTION_COUNT_UPDATED_CHANNEL,
        String(decrResult)
      );
    });
  });

  SUBSCRIBER.subscribe(CONNECTION_COUNT_UPDATED_CHANNEL, (err, count) => {
    if (err) {
      console.error(
        `Error subscribing to ${CONNECTION_COUNT_UPDATED_CHANNEL}`,
        err
      );

      return;
    }

    console.log(
      `${count} Clients subscribed to ${CONNECTION_COUNT_UPDATED_CHANNEL} channel`
    );
  });

  SUBSCRIBER.subscribe(NEW_MESSAGE_CHANNEL, (err, count) => {
    if (err) {
      console.error(`Error subscribing to ${NEW_MESSAGE_CHANNEL}`, err);
      return;
    }

    console.log(
      `${count} Clients subscribed to ${NEW_MESSAGE_CHANNEL} channel`
    );
  });

  SUBSCRIBER.on('message', (channel, text) => {
    if (channel === CONNECTION_COUNT_UPDATED_CHANNEL) {
      app.io.emit(CONNECTION_COUNT_UPDATED_CHANNEL, {
        count: text,
      });

      return;
    }

    if (channel === NEW_MESSAGE_CHANNEL) {
      app.io.emit(NEW_MESSAGE_CHANNEL, {
        message: text,
        id: randomUUID(),
        createdAt: new Date(),
        port: PORT,
      });

      return;
    }
  });

  app.get('/healthcheck', () => {
    return {
      status: 'OK',
      port: PORT,
    };
  });

  return app;
}

async function main() {
  const app = await buildServer();

  try {
    await app.listen({
      port: PORT,
      host: HOST,
    });

    closeWithGrace({ delay: 2000 }, async ({ signal, err }) => {
      if (connectedClients > 0) {
        console.log(`Removing ${connectedClients} from the count`);

        const currentCount = parseInt(
          (await PUBLISHER.get(CONNECTION_COUNT_KEY)) || '0',
          10
        );

        const newCount = Math.max(currentCount - connectedClients, 0);

        await PUBLISHER.set(CONNECTION_COUNT_KEY, newCount);
      }

      await app.close();
    });

    console.log(`Server started at http://${HOST}:${PORT}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
