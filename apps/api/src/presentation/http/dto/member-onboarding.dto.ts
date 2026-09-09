import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Length, Matches, MinLength, ValidateNested } from 'class-validator';
import { MemberAddressDto, MemberChildDto } from './member-profile.dto';

export class MemberOnboardingTokenDto {
  @IsString()
  @Length(32, 128)
  token!: string;
}

export class CompleteMemberOnboardingDto extends MemberOnboardingTokenDto {
  @IsString()
  @MinLength(10)
  password!: string;

  @IsOptional() @IsString() @Length(8, 32) phone?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate?: string;
  @IsOptional() @IsString() @Length(2, 120) spouseName?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) marriageDate?: string;
  @IsOptional() @IsBoolean() whatsappCommunicationOptIn?: boolean;
  @IsOptional() @ValidateNested() @Type(() => MemberAddressDto) address?: MemberAddressDto;
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => MemberChildDto)
  children: MemberChildDto[] = [];
}
