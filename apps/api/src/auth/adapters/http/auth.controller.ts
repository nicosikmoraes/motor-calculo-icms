import { Body, ConflictException, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RegisterUser } from '../../application/register-user.js';
import { EmailAlreadyRegisteredError, type PublicUser } from '../../ports/user-repository.js';
import { ApiErrorEnvelopeDoc } from '../../../donations/adapters/http/donation-api-docs.js';
import { PublicUserEnvelopeDoc, RegisterRequest } from './auth.dto.js';

@ApiTags('autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly registerUser: RegisterUser) {}

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
}
