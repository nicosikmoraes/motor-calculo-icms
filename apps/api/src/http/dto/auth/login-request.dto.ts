import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginRequest {
  @ApiProperty({ example: 'ana@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'informe um e-mail válido' })
  @MaxLength(254)
  email!: string;

  // No login não se repete a regra de tamanho do cadastro: só se exige texto (com um teto contra abuso).
  @ApiProperty({ example: 'uma senha longa' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password!: string;
}
