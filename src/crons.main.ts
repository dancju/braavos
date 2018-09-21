import { NestFactory } from '@nestjs/core';
import { CronModule } from './crons/cron.module';

async function bootstrap() {
  const app = await NestFactory.create(CronModule);
  await app.init();
  // await app.listen(app.get('ConfigService').get('master').port);
}

bootstrap();
