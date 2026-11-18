import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter.js';
import { TransformInterceptor } from './common/http/transform.interceptor.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthGuard } from './auth/guard/auth.guard.js';
import { RolesGuard } from './auth/guard/roles.guard.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { DonationsModule } from './donations/donations.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, DonationsModule],
  controllers: [AppController],
  providers: [
    AppService,
    // Seguro por padrão: toda rota exige token; as abertas são marcadas uma a uma com @Public().
    // Os Guards globais rodam na ordem desta lista: primeiro "quem é você" (401),
    // depois "você pode" (403), porque o RolesGuard lê o req.user que o AuthGuard anexa.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Registrados aqui (e não no main.ts) para valerem também nos testes de ponta a ponta.
    { provide: APP_PIPE, useValue: new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }) },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
