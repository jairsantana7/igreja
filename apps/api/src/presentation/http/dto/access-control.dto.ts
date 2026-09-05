import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsString, IsUUID, Length, Matches, MinLength } from 'class-validator';

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

  @IsString()
  @MinLength(10)
  password!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
