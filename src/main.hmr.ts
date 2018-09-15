import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClientModule } from './client.module';

declare const module: any;

async function bootstrap() {
  const app = await NestFactory.create(ClientModule);
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(app.get('ConfigService').get('client').port);

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose(() => app.close());
  }
}
bootstrap();
