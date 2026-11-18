import { Body, ConflictException, Controller, Get, HttpCode, HttpStatus, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InvalidCredentialsError, Login, type LoginResult } from '../../application/login.js';
import { RegisterUser } from '../../application/register-user.js';
import { EmailAlreadyRegisteredError, type PublicUser, USER_REPOSITORY, type UserRepository } from '../../ports/user-repository.js';
import type { AuthenticatedUser } from '../../guard/authenticated-user.js';
import { CurrentUser } from '../../guard/current-user.decorator.js';
import { Public } from '../../guard/public.decorator.js';
import { ApiErrorEnvelopeDoc } from '../../../donations/adapters/http/donation-api-docs.js';
import { LoginRequest, LoginResultEnvelopeDoc, PublicUserEnvelopeDoc, RegisterRequest } from './auth.dto.js';

@ApiTags('autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUser,
    private readonly login: Login,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  @Public()
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

  @Public()
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

  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Devolve quem está chamando, a partir do token' })
  @ApiResponse({ status: 200, description: 'O usuário dono do token, sem o hash', type: PublicUserEnvelopeDoc })
  @ApiResponse({ status: 401, description: 'Token ausente, adulterado, expirado ou de usuário que não existe mais', type: ApiErrorEnvelopeDoc })
  async me(@CurrentUser() caller: AuthenticatedUser): Promise<PublicUser> {
    const user = await this.users.findById(caller.sub);
    if (!user) throw new UnauthorizedException('Não autenticado');
    return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
  }
}
