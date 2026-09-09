import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsString, IsUUID, Length, Matches, ValidateNested } from 'class-validator';
import { UpdateMemberProfileDto } from './member-profile.dto';

export class CreateRoleDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{1,62}$/)
  key!: string;

  @IsString()
  @Length(2, 80)
  name!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissions: string[] = [];
}

export class CreateUserDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  roleIds!: string[];

  @ValidateNested()
  @Type(() => UpdateMemberProfileDto)
  profile!: UpdateMemberProfileDto;
}

export class UpdateUserNameDto {
  @IsString()
  @Length(2, 120)
  name!: string;
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissions: string[] = [];
}
