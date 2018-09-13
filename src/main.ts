import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Braavos Client')
      .setDescription('')
      .setSchemes('http', 'https')
      .setVersion('1.0')
      .addBearerAuth('Authorization', 'header')
      .build(),
  );
  SwaggerModule.setup('api', app, document);
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(app.get('ConfigService').get('express').port);
}
bootstrap();
