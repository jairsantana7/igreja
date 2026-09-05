import { Type } from 'class-transformer';
import { Allow, ArrayMaxSize, IsArray, IsEmail, IsString, IsUUID, Length, Matches, MinLength, ValidateNested } from 'class-validator';

export class LoginDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{2,62}$/)
  tenantSlug!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class EventLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class EventSignUpDto extends EventLoginDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[] = [];
}

export class AnswerDto {
  @IsUUID('4')
  fieldId!: string;

  @Allow()
  value!: unknown;
}

export class RegistrationDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[] = [];
}
