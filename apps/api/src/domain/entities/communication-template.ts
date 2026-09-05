import { DomainError } from './errors';

export const COMMUNICATION_TEMPLATE_CHANNELS = ['email', 'whatsapp'] as const;
export type CommunicationTemplateChannel = (typeof COMMUNICATION_TEMPLATE_CHANNELS)[number];
export const COMMUNICATION_TEMPLATE_PURPOSES = ['registration_confirmation', 'event_reminder', 'event_update', 'event_cancellation', 'post_event'] as const;
export type CommunicationTemplatePurpose = (typeof COMMUNICATION_TEMPLATE_PURPOSES)[number];
export const COMMUNICATION_TEMPLATE_STATUSES = ['draft', 'active', 'archived'] as const;
export type CommunicationTemplateStatus = (typeof COMMUNICATION_TEMPLATE_STATUSES)[number];

export const COMMUNICATION_TEMPLATE_VARIABLES = [
  'membro.nome',
  'evento.nome',
  'evento.data',
  'evento.local',
  'inscricao.link',
] as const;

const variablePattern = /\{\{\s*([^{}]+?)\s*\}\}/g;

export class CommunicationTemplateContent {
  private constructor(readonly props: {
    name: string;
    purpose: CommunicationTemplatePurpose;
    channel: CommunicationTemplateChannel;
    subject: string;
    body: string;
    variables: string[];
  }) {}

  static create(input: Omit<CommunicationTemplateContent['props'], 'variables'>) {
    const name = input.name.trim();
    const subject = input.subject.trim();
    const body = input.body.trim();
    if (name.length < 3 || name.length > 120) throw new DomainError('O nome do modelo deve ter entre 3 e 120 caracteres.');
    if (!COMMUNICATION_TEMPLATE_PURPOSES.includes(input.purpose)) throw new DomainError('A finalidade do modelo é inválida.');
    if (!COMMUNICATION_TEMPLATE_CHANNELS.includes(input.channel)) throw new DomainError('O canal do modelo é inválido.');
    if (subject.length > 160 || (input.channel === 'email' && subject.length < 1)) throw new DomainError('Informe um assunto de até 160 caracteres para modelos de e-mail.');
    if (body.length < 1 || body.length > 5000) throw new DomainError('A mensagem deve ter entre 1 e 5.000 caracteres.');
    const source = `${subject}\n${body}`;
    const variables = [...new Set([...source.matchAll(variablePattern)].map((match) => match[1]!.trim()))];
    if (source.replace(variablePattern, '').includes('{{') || source.replace(variablePattern, '').includes('}}')) throw new DomainError('Existe uma variável incompleta na mensagem.');
    const unknown = variables.filter((variable) => !COMMUNICATION_TEMPLATE_VARIABLES.includes(variable as typeof COMMUNICATION_TEMPLATE_VARIABLES[number]));
    if (unknown.length) throw new DomainError(`Variáveis não reconhecidas: ${unknown.join(', ')}.`);
    return new CommunicationTemplateContent({ name, purpose: input.purpose, channel: input.channel, subject, body, variables });
  }
}

export class EventReminderConfiguration {
  private constructor(readonly props: { audience: 'confirmed' | 'checked_in' | 'not_checked_in'; offsetMinutesBefore: number; enabled: boolean }) {}

  static create(input: EventReminderConfiguration['props']) {
    if (!['confirmed', 'checked_in', 'not_checked_in'].includes(input.audience)) throw new DomainError('O público do lembrete é inválido.');
    if (!Number.isInteger(input.offsetMinutesBefore) || input.offsetMinutesBefore < 15 || input.offsetMinutesBefore > 43_200) {
      throw new DomainError('A antecedência deve estar entre 15 minutos e 30 dias.');
    }
    return new EventReminderConfiguration(input);
  }
}
