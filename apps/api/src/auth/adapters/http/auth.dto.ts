import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, registerDecorator, type ValidationOptions } from 'class-validator';

const MIN_PASSWORD_BYTES = 8;
// O bcrypt ignora o que passa de 72 bytes: aceitar mais deixaria duas senhas diferentes valerem igual.
const MAX_PASSWORD_BYTES = 72;

/** Limite em bytes UTF-8, não em caracteres: "ç" ocupa 2 bytes. */
function PasswordBytes(options?: ValidationOptions) {
  return (target: object, propertyName: string) => registerDecorator({
    name: 'passwordBytes',
    target: target.constructor,
    propertyName,
    options: { message: `a senha deve ter de ${MIN_PASSWORD_BYTES} a ${MAX_PASSWORD_BYTES} bytes`, ...options },
    validator: {
      validate: (value: unknown) => typeof value === 'string'
        && Buffer.byteLength(value, 'utf8') >= MIN_PASSWORD_BYTES
        && Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES,
    },
  });
}

export class RegisterRequest {
  @ApiProperty({ example: 'ana@example.com', maxLength: 254 })
  // Espaços nas pontas não tornam o e-mail inválido; a caixa é normalizada no caso de uso.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'informe um e-mail válido' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'uma senha longa', minLength: 8, maxLength: 72, description: 'De 8 a 72 bytes em UTF-8' })
  @IsString()
  @PasswordBytes()
  password!: string;
}

export class PublicUserDoc {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'ana@example.com' }) email!: string;
  @ApiProperty({ enum: ['SUPPORTER', 'ADMIN'], example: 'SUPPORTER' }) role!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class PublicUserEnvelopeDoc {
  @ApiProperty({ type: PublicUserDoc }) data!: PublicUserDoc;
}
