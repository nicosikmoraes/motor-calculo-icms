import { Body, ConflictException, Controller, HttpCode, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InvalidCredentialsError, Login, type LoginResult } from '../../application/login.js';
import { RegisterUser } from '../../application/register-user.js';
import { EmailAlreadyRegisteredError, type PublicUser } from '../../ports/user-repository.js';
import { ApiErrorEnvelopeDoc } from '../../../donations/adapters/http/donation-api-docs.js';
import { LoginRequest, LoginResultEnvelopeDoc, PublicUserEnvelopeDoc, RegisterRequest } from './auth.dto.js';

@ApiTags('autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly registerUser: RegisterUser, private readonly login: Login) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria uma conta de apoiador. O papel é sempre SUPPORTER, definido pelo servidor.' })
  @ApiResponse({ status: 201, description: 'Conta criada; a resposta nunca traz a senha nem o hash', type: PublicUserEnvelopeDoc })
  @ApiResponse({ status: 400, description: 'E-mail inválido, senha fora de 8 a 72 bytes ou campo não permitido', type: ApiErrorEnvelopeDoc })
  @ApiResponse({ status: 409, description: 'E-mail já cadastrado', type: ApiErrorEnvelopeDoc })
  async register(@Body() body: RegisterRequest): Promise<PublicUser> {
    try {
      return await this.registerUser.execute(body);
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Troca e-mail e senha por um token JWT válido por 2 horas' })
  @ApiResponse({ status: 200, description: 'Token para o cabeçalho Authorization: Bearer <token>', type: LoginResultEnvelopeDoc })
  @ApiResponse({ status: 400, description: 'Corpo inválido', type: ApiErrorEnvelopeDoc })
  @ApiResponse({ status: 401, description: 'E-mail ou senha inválidos — a mesma resposta nos dois casos', type: ApiErrorEnvelopeDoc })
  async signIn(@Body() body: LoginRequest): Promise<LoginResult> {
    try {
      return await this.login.execute(body);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) throw new UnauthorizedException(error.message);
      throw error;
    }
  }
}
