import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useSecurityHeaders();   // cabeçalhos de segurança em toda resposta (e some o X-Powered-By)
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('API de doações do ContabiliNico')
    .setDescription('Pedidos de doação pelo Stripe. Sucesso sempre vem em { data }; erro sempre vem em { error }.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '127.0.0.1');
}
await bootstrap();
