import type { AuditCursor, AuditEventPage, AuditEventView, AuditTrailRepository } from '../ports/audit-trail.port';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../domain/entities/permission';
import { DomainError } from '../../domain/entities/errors';
import { AuthorizationError } from './errors';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS: AuditEventView['action'][] = ['created', 'updated', 'deleted'];

export class ListAuditEventsUseCase {
  constructor(private readonly audit: AuditTrailRepository) {}
  async execute(principal: AuthenticatedPrincipal, input: {
    limit?: number;
    eventId?: string;
    action?: AuditEventView['action'];
    cursor?: string;
  } = {}): Promise<AuditEventPage> {
    if (!principal.permissions.includes(PERMISSIONS.auditRead)) {
      throw new AuthorizationError('Você não tem permissão para visualizar a auditoria.');
    }
    const limit = input.limit === undefined ? 25 : Number(input.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError('O limite da auditoria deve estar entre 1 e 100.');
    if (input.eventId && !UUID_PATTERN.test(input.eventId)) throw new DomainError('O evento informado para auditoria é inválido.');
    if (input.action && !ACTIONS.includes(input.action)) throw new DomainError('O filtro de ação da auditoria é inválido.');
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : undefined;
    const rows = await this.audit.list(principal, {
      limit: limit + 1,
      eventId: input.eventId,
      action: input.action,
      cursor,
    });
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit && items.length ? this.encodeCursor(items.at(-1)!) : null,
    };
  }

  private encodeCursor(event: Pick<AuditEventView, 'createdAt' | 'id'>) {
    return Buffer.from(JSON.stringify({ createdAt: event.createdAt, id: event.id }), 'utf8').toString('base64url');
  }

  private decodeCursor(value: string): AuditCursor {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<AuditCursor>;
      const date = typeof parsed.createdAt === 'string' ? new Date(parsed.createdAt) : null;
      if (!date || Number.isNaN(date.getTime()) || date.toISOString() !== parsed.createdAt || !parsed.id || !UUID_PATTERN.test(parsed.id)) {
        throw new Error('invalid');
      }
      return { createdAt: parsed.createdAt, id: parsed.id };
    } catch {
      throw new DomainError('O cursor da auditoria é inválido.');
    }
  }
}
