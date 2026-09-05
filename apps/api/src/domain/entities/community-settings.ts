import { DomainError } from './errors';

export type PaymentEnvironment = 'sandbox' | 'production';
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export interface SocialProviderSettings {
  enabled: boolean;
  clientId: string;
  secretReference: string;
}

export interface PixSettings {
  enabled: boolean;
  keyType: PixKeyType;
  key: string;
  recipientName: string;
  city: string;
}

export interface PaymentGatewaySettings {
  enabled: boolean;
  providerKey: string;
  environment: PaymentEnvironment;
  publicIdentifier: string;
  secretReference: string;
}

export interface CommunitySettingsProps {
  socialLogin: {
    google: SocialProviderSettings;
    microsoft: SocialProviderSettings;
  };
  payments: {
    pix: PixSettings;
    gateway: PaymentGatewaySettings;
  };
}

const PROVIDER_KEY = /^[a-z][a-z0-9_-]{1,62}$/;
const SECRET_REFERENCE = /^[A-Z][A-Z0-9_]{2,127}$/;
const PIX_KEY_TYPES: PixKeyType[] = ['cpf', 'cnpj', 'email', 'phone', 'random'];
const PAYMENT_ENVIRONMENTS: PaymentEnvironment[] = ['sandbox', 'production'];

function normalizeSocialProvider(name: string, input: SocialProviderSettings): SocialProviderSettings {
  const settings = {
    enabled: input.enabled,
    clientId: input.clientId.trim(),
    secretReference: input.secretReference.trim(),
  };
  if (settings.secretReference && !SECRET_REFERENCE.test(settings.secretReference)) {
    throw new DomainError(`A referência de segredo do ${name} deve ser o nome de uma variável de ambiente válida.`);
  }
  if (settings.enabled && (!settings.clientId || !settings.secretReference)) {
    throw new DomainError(`Informe o Client ID e a referência de segredo para habilitar ${name}.`);
  }
  if (settings.clientId.length > 250) throw new DomainError(`O Client ID do ${name} é muito longo.`);
  return settings;
}

export class CommunitySettings {
  private constructor(readonly props: CommunitySettingsProps) {}

  static create(input: CommunitySettingsProps): CommunitySettings {
    const pix: PixSettings = {
      ...input.payments.pix,
      key: input.payments.pix.key.trim(),
      recipientName: input.payments.pix.recipientName.trim(),
      city: input.payments.pix.city.trim(),
    };
    if (!PIX_KEY_TYPES.includes(pix.keyType)) throw new DomainError('O tipo de chave PIX é inválido.');
    if (pix.key.length > 160 || pix.recipientName.length > 120 || pix.city.length > 80) {
      throw new DomainError('Um ou mais dados do PIX excedem o tamanho permitido.');
    }
    if (pix.enabled && (!pix.key || !pix.recipientName || !pix.city)) {
      throw new DomainError('Informe a chave PIX, o nome do recebedor e a cidade para habilitar o PIX.');
    }

    const gateway: PaymentGatewaySettings = {
      ...input.payments.gateway,
      providerKey: input.payments.gateway.providerKey.trim().toLowerCase(),
      publicIdentifier: input.payments.gateway.publicIdentifier.trim(),
      secretReference: input.payments.gateway.secretReference.trim(),
    };
    if (gateway.providerKey && !PROVIDER_KEY.test(gateway.providerKey)) {
      throw new DomainError('A chave do adaptador de pagamento é inválida.');
    }
    if (!PAYMENT_ENVIRONMENTS.includes(gateway.environment)) throw new DomainError('O ambiente do gateway é inválido.');
    if (gateway.publicIdentifier.length > 250) throw new DomainError('O identificador público do gateway é muito longo.');
    if (gateway.secretReference && !SECRET_REFERENCE.test(gateway.secretReference)) {
      throw new DomainError('A referência de segredo do gateway deve ser o nome de uma variável de ambiente válida.');
    }
    if (gateway.enabled && (!gateway.providerKey || !gateway.secretReference)) {
      throw new DomainError('Informe o adaptador e a referência de segredo para habilitar o gateway.');
    }

    return new CommunitySettings({
      socialLogin: {
        google: normalizeSocialProvider('Google', input.socialLogin.google),
        microsoft: normalizeSocialProvider('Microsoft', input.socialLogin.microsoft),
      },
      payments: { pix, gateway },
    });
  }

  static defaults(): CommunitySettings {
    return CommunitySettings.create({
      socialLogin: {
        google: { enabled: false, clientId: '', secretReference: '' },
        microsoft: { enabled: false, clientId: '', secretReference: '' },
      },
      payments: {
        pix: { enabled: false, keyType: 'random', key: '', recipientName: '', city: '' },
        gateway: {
          enabled: false,
          providerKey: '',
          environment: 'sandbox',
          publicIdentifier: '',
          secretReference: '',
        },
      },
    });
  }
}
