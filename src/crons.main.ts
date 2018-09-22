import { NestFactory } from '@nestjs/core';
import { CronModule } from './crons/cron.module';

async function bootstrap() {
  const app = await NestFactory.create(CronModule);
  await app.listen(0);
}

bootstrap();
