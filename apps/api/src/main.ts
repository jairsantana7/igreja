import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './infrastructure/config/env';
import { ApplicationExceptionFilter } from './presentation/http/application-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  app.set('trust proxy', env.trustProxy);
  app.use(helmet());
  app.enableCors({ origin: env.corsOrigin.split(',').map((origin) => origin.trim()), credentials: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(app.get(ApplicationExceptionFilter));
  app.enableShutdownHooks();
  await app.listen(env.apiPort, '0.0.0.0');
}

void bootstrap();
