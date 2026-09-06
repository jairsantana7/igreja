import { Type } from 'class-transformer';
import { Allow, ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString, IsUUID, Length, Matches, MinLength, ValidateNested } from 'class-validator';
import { MemberAddressDto, MemberChildDto } from './member-profile.dto';

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

export class ProgressiveProfileDto {
  @IsOptional() @IsString() @Length(8, 32) phone?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate?: string;
  @IsOptional() @IsString() @Length(2, 120) spouseName?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) marriageDate?: string;
  @IsOptional() @ValidateNested() @Type(() => MemberAddressDto) address?: MemberAddressDto;
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => MemberChildDto)
  children: MemberChildDto[] = [];
}

export class RegistrationDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[] = [];

  @IsOptional() @ValidateNested() @Type(() => ProgressiveProfileDto)
  profile?: ProgressiveProfileDto;

  @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  @Matches(/^(registrant|spouse|child:\d+)$/, { each: true })
  participantKeys: string[] = [];

  @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true })
  offeringIds: string[] = [];
}

export class EventSignUpDto extends RegistrationDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class AnswerDto {
  @IsUUID('4')
  fieldId!: string;

  @Allow()
  value!: unknown;
}
