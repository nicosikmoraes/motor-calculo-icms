import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { buildOpenApiDocument } from './http/openapi.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useSecurityHeaders();   // cabeçalhos de segurança em toda resposta (e some o X-Powered-By)
  app.enableShutdownHooks();

  SwaggerModule.setup('docs', app, () => buildOpenApiDocument(app));

  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '127.0.0.1');
}
await bootstrap();
