import './config';
import 'newrelic';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { init } from '@sentry/node';
import { BullMqService, getErrorInterceptor, Logger } from '@novu/application-generic';

import { AppModule } from './app.module';
import { CONTEXT_PATH, validateEnv } from './config';
import { InMemoryIoAdapter } from './shared/framework/in-memory-io.adapter';

import { version } from '../package.json';
import { prepareAppInfra, startAppInfra } from './socket/services';

if (process.env.SENTRY_DSN) {
  init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: `v${version}`,
  });
}

// Validate the ENV variables after launching SENTRY, so missing variables will report to sentry
validateEnv();

export async function bootstrap() {
  BullMqService.haveProInstalled();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const inMemoryAdapter = new InMemoryIoAdapter(app);
  await inMemoryAdapter.connectToInMemoryCluster();

  app.useLogger(app.get(Logger));
  app.flushLogs();

  await prepareAppInfra(app);

  app.useGlobalInterceptors(getErrorInterceptor());

  app.setGlobalPrefix(CONTEXT_PATH);

  app.use(helmet());

  app.enableCors({
    origin: '*',
    preflightContinue: false,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useWebSocketAdapter(inMemoryAdapter);

  app.enableShutdownHooks();

  await app.init();

  try {
    await startAppInfra(app);
  } catch (e) {
    process.exit(1);
  }

  await app.listen(process.env.PORT as string);
}
