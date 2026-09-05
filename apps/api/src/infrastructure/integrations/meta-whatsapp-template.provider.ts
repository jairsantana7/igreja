import type { SecretResolver } from '../../application/ports/secret-resolver.port';
import type { WhatsAppTemplateChannel, WhatsAppTemplateProvider } from '../../application/ports/whatsapp-template.port';
import { WhatsAppTemplateProjection } from '../../domain/entities/whatsapp-template';

interface MetaTemplateResponse {
  data?: Array<{ id?: string; name?: string; language?: string; category?: string; status?: string; components?: unknown[] }>;
  paging?: { cursors?: { after?: string }; next?: string };
}

type Fetcher = (input: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export class MetaWhatsAppTemplateProvider implements WhatsAppTemplateProvider {
  readonly providerKey = 'whatsapp_cloud';

  constructor(
    private readonly secrets: SecretResolver,
    private readonly graphApiVersion: string,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async list(channel: WhatsAppTemplateChannel): Promise<WhatsAppTemplateProjection[]> {
    if (!/^v\d+\.\d+$/.test(this.graphApiVersion)) throw new Error('Versão da Graph API não configurada.');
    if (!/^\d{5,40}$/.test(channel.providerAccountId)) throw new Error('WABA ID inválido.');
    if (!channel.secretReference) throw new Error('Referência do token não configurada.');
    const token = this.secrets.resolve(channel.secretReference);
    const templates: WhatsAppTemplateProjection[] = [];
    let after: string | undefined;
    for (let page = 0; page < 100; page += 1) {
      const url = new URL(`https://graph.facebook.com/${this.graphApiVersion}/${encodeURIComponent(channel.providerAccountId)}/message_templates`);
      url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('after', after);
      const response = await this.fetcher(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Meta Graph API respondeu com status ${response.status}.`);
      const payload = await response.json() as MetaTemplateResponse;
      if (!Array.isArray(payload.data)) throw new Error('Resposta inesperada da Meta Graph API.');
      templates.push(...payload.data.map((item) => WhatsAppTemplateProjection.create({
        providerTemplateId: item.id ?? '', name: item.name ?? '', language: item.language ?? '',
        category: item.category ?? '', status: item.status ?? '', components: item.components ?? [],
      })));
      const next = payload.paging?.next ? payload.paging.cursors?.after : undefined;
      if (!next) return templates;
      after = next;
    }
    throw new Error('A paginação da Meta excedeu o limite de segurança.');
  }
}
