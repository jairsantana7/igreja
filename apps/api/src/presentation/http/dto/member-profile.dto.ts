import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, Length, Matches, ValidateNested } from 'class-validator';

export class MemberAddressDto {
  @IsOptional() @IsString() @Length(1, 16) postalCode?: string;
  @IsOptional() @IsString() @Length(1, 160) street?: string;
  @IsOptional() @IsString() @Length(1, 32) number?: string;
  @IsOptional() @IsString() @Length(1, 120) complement?: string;
  @IsOptional() @IsString() @Length(1, 120) neighborhood?: string;
  @IsOptional() @IsString() @Length(1, 120) city?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{2}$/) state?: string;
}

export class MemberChildDto {
  @IsString() @Length(2, 120) name!: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate?: string;
}

export class UpdateMemberProfileDto {
  @IsOptional() @IsString() @Length(8, 32) phone?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate?: string;
  @IsOptional() @IsString() @Length(2, 120) spouseName?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) marriageDate?: string;
  @IsOptional() @ValidateNested() @Type(() => MemberAddressDto) address?: MemberAddressDto;
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => MemberChildDto)
  children: MemberChildDto[] = [];
}
