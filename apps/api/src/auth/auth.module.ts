import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PrismaClient } from '../generated/prisma/client.js';
import { readJwtSecret } from './auth-config.js';
import { BcryptPasswordHasher } from './adapters/bcrypt/bcrypt-password-hasher.js';
import { AuthController } from '../http/controllers/auth/auth.controller.js';
import { JwtAccessTokenIssuer } from './adapters/jwt/jwt-access-token-issuer.js';
import { PrismaUserRepository } from './adapters/prisma/prisma-user-repository.js';
import { ACCESS_TOKEN_ISSUER, JWT_EXPIRES_IN_SECONDS, type AccessTokenIssuer } from './application/access-token-issuer.js';
import { Login } from './application/login.js';
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
    { provide: ACCESS_TOKEN_ISSUER, inject: [JwtService], useFactory: (jwt: JwtService) => new JwtAccessTokenIssuer(jwt) },
    {
      provide: Login,
      inject: [USER_REPOSITORY, PASSWORD_HASHER, ACCESS_TOKEN_ISSUER],
      // O hash fictício usa o mesmo hasher (e custo) dos usuários reais, para os dois caminhos levarem o mesmo tempo.
      useFactory: async (users: UserRepository, hasher: PasswordHasher, tokens: AccessTokenIssuer) =>
        new Login(users, hasher, tokens, await hasher.hash(randomBytes(32).toString('base64'))),
    },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
