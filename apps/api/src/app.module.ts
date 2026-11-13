import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DonationsModule } from './donations/donations.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DonationsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
