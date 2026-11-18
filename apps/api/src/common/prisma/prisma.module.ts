import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

/** Um único PrismaClient para a API inteira (doações e autenticação). */
@Global()
@Module({
  providers: [{
    provide: PrismaClient,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => new PrismaClient({
      adapter: new PrismaPg({ connectionString: config.get<string>('DATABASE_URL') ?? 'postgresql://none:none@127.0.0.1:5433/none' }),
    }),
  }],
  exports: [PrismaClient],
})
export class PrismaModule {}
