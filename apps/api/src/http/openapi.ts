import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/** O documento servido em /docs. Fica aqui (e não no main.ts) para os testes conferirem o mesmo documento. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('API de doações do ContabiliNico')
    .setDescription('Contas, login e pedidos de doação pelo Stripe. Sucesso sempre vem em { data }; erro sempre vem em { error }. '
      + 'Rotas com cadeado exigem Authorization: Bearer <token>; obtenha o token em POST /auth/login e use o botão Authorize.')
    .setVersion('1.0')
    // Só documenta: quem protege de verdade é o AuthGuard global.
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .build();
  return SwaggerModule.createDocument(app, config);
}
