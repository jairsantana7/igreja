import { DomainError } from './errors';

export const CONVERSATION_STATUSES = ['open', 'waiting', 'resolved'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export class ConversationChannelConfiguration {
  private constructor(readonly props: { providerKey: string; displayName: string; phoneNumber: string; providerAccountId: string; secretReference?: string }) {}

  static create(input: ConversationChannelConfiguration['props']) {
    const props = {
      ...input,
      providerKey: input.providerKey.toLowerCase().trim(),
      displayName: input.displayName.trim(),
      phoneNumber: input.phoneNumber.trim(),
      providerAccountId: input.providerAccountId.trim(),
      secretReference: input.secretReference?.trim() || undefined,
    };
    if (!/^[a-z][a-z0-9_-]{1,62}$/.test(props.providerKey)) throw new DomainError('A chave do provedor é inválida.');
    if (props.displayName.length < 2 || props.displayName.length > 80) throw new DomainError('O nome do canal deve ter entre 2 e 80 caracteres.');
    if (props.phoneNumber.length < 8 || props.phoneNumber.length > 32) throw new DomainError('O número informado é inválido.');
    if (props.secretReference && !/^[A-Z][A-Z0-9_]{2,127}$/.test(props.secretReference)) throw new DomainError('A referência do segredo deve ser o nome de uma variável de ambiente.');
    return new ConversationChannelConfiguration(props);
  }
}

export class OutboundConversationMessage {
  private constructor(readonly body: string) {}
  static create(value: string) {
    const body = value.trim();
    if (body.length < 1 || body.length > 10000) throw new DomainError('A mensagem deve ter entre 1 e 10.000 caracteres.');
    return new OutboundConversationMessage(body);
  }
}
