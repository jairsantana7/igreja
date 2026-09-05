import { DomainError } from './errors';

export class WhatsAppTemplateProjection {
  private constructor(readonly props: {
    providerTemplateId: string;
    name: string;
    language: string;
    category: string;
    status: string;
    components: unknown[];
  }) {}

  static create(input: WhatsAppTemplateProjection['props']) {
    const clean = (value: string, field: string, max: number) => {
      const normalized = value.trim();
      if (!normalized || normalized.length > max) throw new DomainError(`O ${field} do template retornado pelo provedor é inválido.`);
      return normalized;
    };
    if (!Array.isArray(input.components)) throw new DomainError('Os componentes do template retornado pelo provedor são inválidos.');
    return new WhatsAppTemplateProjection({
      providerTemplateId: clean(input.providerTemplateId, 'identificador', 180),
      name: clean(input.name, 'nome', 512),
      language: clean(input.language, 'idioma', 35),
      category: clean(input.category, 'tipo', 80).toUpperCase(),
      status: clean(input.status, 'status', 80).toUpperCase(),
      components: input.components,
    });
  }
}
