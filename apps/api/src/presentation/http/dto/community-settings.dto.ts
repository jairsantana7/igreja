import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsString, Length, Matches, ValidateNested } from 'class-validator';

const OPTIONAL_SECRET_REFERENCE = /^$|^[A-Z][A-Z0-9_]{2,127}$/;
const OPTIONAL_PROVIDER_KEY = /^$|^[a-z][a-z0-9_-]{1,62}$/;

class SocialProviderSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @Length(0, 250)
  clientId!: string;

  @IsString()
  @Matches(OPTIONAL_SECRET_REFERENCE)
  secretReference!: string;
}

class SocialLoginSettingsDto {
  @ValidateNested()
  @Type(() => SocialProviderSettingsDto)
  google!: SocialProviderSettingsDto;

  @ValidateNested()
  @Type(() => SocialProviderSettingsDto)
  microsoft!: SocialProviderSettingsDto;
}

class PixSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(['cpf', 'cnpj', 'email', 'phone', 'random'])
  keyType!: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

  @IsString()
  @Length(0, 160)
  key!: string;

  @IsString()
  @Length(0, 120)
  recipientName!: string;

  @IsString()
  @Length(0, 80)
  city!: string;
}

class PaymentGatewaySettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @Matches(OPTIONAL_PROVIDER_KEY)
  providerKey!: string;

  @IsIn(['sandbox', 'production'])
  environment!: 'sandbox' | 'production';

  @IsString()
  @Length(0, 250)
  publicIdentifier!: string;

  @IsString()
  @Matches(OPTIONAL_SECRET_REFERENCE)
  secretReference!: string;
}

class PaymentSettingsDto {
  @ValidateNested()
  @Type(() => PixSettingsDto)
  pix!: PixSettingsDto;

  @ValidateNested()
  @Type(() => PaymentGatewaySettingsDto)
  gateway!: PaymentGatewaySettingsDto;
}

export class UpdateCommunitySettingsDto {
  @ValidateNested()
  @Type(() => SocialLoginSettingsDto)
  socialLogin!: SocialLoginSettingsDto;

  @ValidateNested()
  @Type(() => PaymentSettingsDto)
  payments!: PaymentSettingsDto;
}
