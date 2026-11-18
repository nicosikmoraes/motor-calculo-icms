import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaClient } from '../generated/prisma/client.js';
import { JWT_EXPIRES_IN_SECONDS, readJwtSecret } from './auth-config.js';
import { BcryptPasswordHasher } from './adapters/bcrypt/bcrypt-password-hasher.js';
import { AuthController } from './adapters/http/auth.controller.js';
import { PrismaUserRepository } from './adapters/prisma/prisma-user-repository.js';
import { PASSWORD_HASHER, type PasswordHasher } from './application/password-hasher.js';
import { RegisterUser } from './application/register-user.js';
import { USER_REPOSITORY, type UserRepository } from './ports/user-repository.js';

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
  controllers: [AuthController],
  providers: [
    { provide: USER_REPOSITORY, inject: [PrismaClient], useFactory: (prisma: PrismaClient) => new PrismaUserRepository(prisma) },
    { provide: PASSWORD_HASHER, useFactory: () => new BcryptPasswordHasher() },
    { provide: RegisterUser, inject: [USER_REPOSITORY, PASSWORD_HASHER],
      useFactory: (users: UserRepository, hasher: PasswordHasher) => new RegisterUser(users, hasher) },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
