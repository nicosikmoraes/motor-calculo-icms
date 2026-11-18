import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JWT_EXPIRES_IN_SECONDS, readJwtSecret } from './auth-config.js';

@Module({
  imports: [
    // registerAsync: a configuração só é montada depois que o ConfigModule leu o ambiente.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: readJwtSecret(config),
        signOptions: { expiresIn: JWT_EXPIRES_IN_SECONDS, algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  exports: [JwtModule],
})
export class AuthModule {}
