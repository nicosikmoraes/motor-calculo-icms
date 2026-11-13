import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter.js';
import { TransformInterceptor } from './common/http/transform.interceptor.js';
import { DonationsModule } from './donations/donations.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DonationsModule],
  controllers: [AppController],
  providers: [
    AppService,
    // Registrados aqui (e não no main.ts) para valerem também nos testes de ponta a ponta.
    { provide: APP_PIPE, useValue: new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }) },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
