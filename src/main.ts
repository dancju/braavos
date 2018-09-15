import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ClientModule } from './client.module';

async function bootstrap() {
  const clientApp = await NestFactory.create(ClientModule);
  const document = SwaggerModule.createDocument(
    clientApp,
    new DocumentBuilder()
      .setTitle('Braavos Client')
      .setDescription('')
      .setSchemes('http', 'https')
      .setVersion('1.0')
      .addBearerAuth('Authorization', 'header')
      .build(),
  );
  SwaggerModule.setup('api', clientApp, document);
  clientApp.useGlobalPipes(new ValidationPipe());
  await clientApp.listen(clientApp.get('ConfigService').get('client').port);
}
bootstrap();
