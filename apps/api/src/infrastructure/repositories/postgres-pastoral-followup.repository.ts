import type { PoolClient } from 'pg';
import type { FollowupCardView, FollowupDetailView, FollowupNoteView, FollowupStageView, FollowupTagView, PastoralFollowupRepository } from '../../application/ports/pastoral-followup.port';
import { ConflictError } from '../../application/use-cases/errors';
import type { FollowupNoteContent, FollowupStageDefinition, FollowupTagDefinition } from '../../domain/entities/pastoral-followup';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PostgresDatabase } from '../database/postgres.database';

const canReadAll = (principal: AuthenticatedPrincipal) => principal.permissions.includes('followups.read_all');
const canReadTeamNotes = (principal: AuthenticatedPrincipal) => principal.permissions.includes('followups.notes_read');

export class PostgresPastoralFollowupRepository implements PastoralFollowupRepository {
  constructor(private readonly database: PostgresDatabase) {}

  stages(principal: AuthenticatedPrincipal): Promise<FollowupStageView[]> {
    return this.database.withTenant(principal, async (client) => (await client.query('SELECT * FROM followup_stages ORDER BY position, id')).rows.map(mapStage));
  }

  createStage(principal: AuthenticatedPrincipal, definition: FollowupStageDefinition): Promise<FollowupStageView> {
    return this.database.withTenant(principal, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${principal.tenantId}:followup-stages`]);
      try {
        const result = await client.query(`
          INSERT INTO followup_stages (tenant_id, name, color, position)
          VALUES ($1, $2, $3, (SELECT COALESCE(max(position), -1) + 1 FROM followup_stages)) RETURNING *
        `, [principal.tenantId, definition.props.name, definition.props.color]);
        return mapStage(result.rows[0]);
      } catch (error: any) {
        if (error?.code === '23505') throw new ConflictError('Já existe uma etapa com esse nome.');
        throw error;
      }
    });
  }

  tags(principal: AuthenticatedPrincipal): Promise<FollowupTagView[]> {
    return this.database.withTenant(principal, async (client) => (await client.query('SELECT * FROM followup_tags ORDER BY name, id')).rows.map(mapTag));
  }

  createTag(principal: AuthenticatedPrincipal, definition: FollowupTagDefinition): Promise<FollowupTagView> {
    return this.database.withTenant(principal, async (client) => {
      try {
        const result = await client.query('INSERT INTO followup_tags (tenant_id, name, color) VALUES ($1, $2, $3) RETURNING *', [principal.tenantId, definition.props.name, definition.props.color]);
        return mapTag(result.rows[0]);
      } catch (error: any) {
        if (error?.code === '23505') throw new ConflictError('Já existe uma etiqueta com esse nome.');
        throw error;
      }
    });
  }

  board(principal: AuthenticatedPrincipal): Promise<FollowupCardView[]> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query(`${cardSelect()} WHERE ($1::boolean OR followups.owner_user_id = $2) ORDER BY followups.updated_at DESC`, [canReadAll(principal), principal.userId, canReadTeamNotes(principal)]);
      return result.rows.map(mapCard);
    });
  }

  detail(principal: AuthenticatedPrincipal, followupId: string): Promise<FollowupDetailView | null> {
    return this.database.withTenant(principal, (client) => this.findDetail(client, principal, followupId));
  }

  createFromConversation(principal: AuthenticatedPrincipal, conversationId: string): Promise<FollowupDetailView | null> {
    return this.database.withTenant(principal, async (client) => {
      const conversation = await client.query(`
        SELECT conversations.contact_name, conversations.contact_address, conversations.member_user_id
        FROM conversations JOIN conversation_channels AS channels
          ON channels.id = conversations.channel_id AND channels.tenant_id = conversations.tenant_id
        WHERE conversations.id = $1 AND ($2::boolean OR conversations.assigned_user_id = $3 OR channels.owner_user_id = $3)
        FOR UPDATE OF conversations
      `, [conversationId, principal.permissions.includes('conversations.read_all'), principal.userId]);
      if (!conversation.rows[0]) return null;
      const existing = await client.query<{ followup_id: string }>('SELECT followup_id FROM followup_conversations WHERE conversation_id = $1', [conversationId]);
      if (existing.rows[0]) return this.findDetail(client, principal, existing.rows[0].followup_id);
      const stage = await client.query<{ id: string }>('SELECT id FROM followup_stages ORDER BY position, id LIMIT 1');
      if (!stage.rows[0]) throw new ConflictError('Crie ao menos uma etapa antes de iniciar o acompanhamento.');
      const source = conversation.rows[0];
      const created = await client.query<{ id: string }>(`
        INSERT INTO pastoral_followups (tenant_id, member_user_id, owner_user_id, stage_id, contact_name, contact_address, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $3) RETURNING id
      `, [principal.tenantId, source.member_user_id, principal.userId, stage.rows[0].id, source.contact_name, source.contact_address]);
      const createdId = created.rows[0]!.id;
      await client.query('INSERT INTO followup_conversations (tenant_id, followup_id, conversation_id) VALUES ($1, $2, $3)', [principal.tenantId, createdId, conversationId]);
      await client.query('INSERT INTO followup_stage_changes (tenant_id, followup_id, to_stage_id, changed_by_user_id) VALUES ($1, $2, $3, $4)', [principal.tenantId, createdId, stage.rows[0].id, principal.userId]);
      return this.findDetail(client, principal, createdId);
    });
  }

  move(principal: AuthenticatedPrincipal, followupId: string, stageId: string): Promise<FollowupCardView | null> {
    return this.database.withTenant(principal, async (client) => {
      const current = await client.query<{ stage_id: string }>('SELECT stage_id FROM pastoral_followups WHERE id = $1 AND ($2::boolean OR owner_user_id = $3) FOR UPDATE', [followupId, canReadAll(principal), principal.userId]);
      if (!current.rows[0] || !(await client.query('SELECT 1 FROM followup_stages WHERE id = $1', [stageId])).rowCount) return null;
      if (current.rows[0].stage_id !== stageId) {
        await client.query('UPDATE pastoral_followups SET stage_id = $2, updated_at = now() WHERE id = $1', [followupId, stageId]);
        await client.query('INSERT INTO followup_stage_changes (tenant_id, followup_id, from_stage_id, to_stage_id, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)', [principal.tenantId, followupId, current.rows[0].stage_id, stageId, principal.userId]);
      }
      return this.findCard(client, principal, followupId);
    });
  }

  update(principal: AuthenticatedPrincipal, followupId: string, input: { nextActionAt: string | null; tagIds: string[] }): Promise<FollowupCardView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccess(client, principal, followupId))) return null;
      if (input.tagIds.length) {
        const tags = await client.query<{ id: string }>('SELECT id FROM followup_tags WHERE id = ANY($1::uuid[])', [input.tagIds]);
        if (tags.rowCount !== input.tagIds.length) return null;
      }
      await client.query('UPDATE pastoral_followups SET next_action_at = $2, updated_at = now() WHERE id = $1', [followupId, input.nextActionAt]);
      await client.query('DELETE FROM followup_tag_assignments WHERE followup_id = $1', [followupId]);
      for (const tagId of input.tagIds) await client.query('INSERT INTO followup_tag_assignments (tenant_id, followup_id, tag_id) VALUES ($1, $2, $3)', [principal.tenantId, followupId, tagId]);
      return this.findCard(client, principal, followupId);
    });
  }

  addNote(principal: AuthenticatedPrincipal, followupId: string, note: FollowupNoteContent): Promise<FollowupNoteView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccess(client, principal, followupId))) return null;
      const result = await client.query(`
        INSERT INTO followup_notes (tenant_id, followup_id, author_user_id, visibility, body)
        VALUES ($1, $2, $3, $4, $5) RETURNING *
      `, [principal.tenantId, followupId, principal.userId, note.props.visibility, note.props.body]);
      return mapNote({ ...result.rows[0], author_name: principal.name }, principal.userId);
    });
  }

  removeNote(principal: AuthenticatedPrincipal, followupId: string, noteId: string): Promise<boolean | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccess(client, principal, followupId))) return null;
      const result = await client.query('DELETE FROM followup_notes WHERE id = $1 AND followup_id = $2 AND author_user_id = $3', [noteId, followupId, principal.userId]);
      return Boolean(result.rowCount);
    });
  }

  private async findCard(client: PoolClient, principal: AuthenticatedPrincipal, followupId: string): Promise<FollowupCardView | null> {
    const result = await client.query(`${cardSelect()} WHERE followups.id = $4 AND ($1::boolean OR followups.owner_user_id = $2)`, [canReadAll(principal), principal.userId, canReadTeamNotes(principal), followupId]);
    return result.rows[0] ? mapCard(result.rows[0]) : null;
  }

  private async findDetail(client: PoolClient, principal: AuthenticatedPrincipal, followupId: string): Promise<FollowupDetailView | null> {
    const card = await this.findCard(client, principal, followupId);
    if (!card) return null;
    const notes = await client.query(`
      SELECT notes.*, users.name AS author_name FROM followup_notes AS notes
      JOIN users ON users.id = notes.author_user_id AND users.tenant_id = notes.tenant_id
      WHERE notes.followup_id = $1 AND (notes.author_user_id = $2 OR ($3::boolean AND notes.visibility = 'team'))
      ORDER BY notes.created_at DESC, notes.id DESC
    `, [followupId, principal.userId, canReadTeamNotes(principal)]);
    const history = await client.query(`
      SELECT changes.id, previous.name AS from_name, next.name AS to_name, users.name AS actor_name, changes.changed_at
      FROM followup_stage_changes AS changes
      LEFT JOIN followup_stages AS previous ON previous.id = changes.from_stage_id AND previous.tenant_id = changes.tenant_id
      JOIN followup_stages AS next ON next.id = changes.to_stage_id AND next.tenant_id = changes.tenant_id
      JOIN users ON users.id = changes.changed_by_user_id AND users.tenant_id = changes.tenant_id
      WHERE changes.followup_id = $1 ORDER BY changes.changed_at DESC, changes.id DESC LIMIT 50
    `, [followupId]);
    return { ...card, notes: notes.rows.map((row) => mapNote(row, principal.userId)), history: history.rows.map((row) => ({ id: row.id, fromStage: row.from_name, toStage: row.to_name, changedBy: row.actor_name, changedAt: row.changed_at.toISOString() })) };
  }
}

async function canAccess(client: PoolClient, principal: AuthenticatedPrincipal, followupId: string) {
  return Boolean((await client.query('SELECT 1 FROM pastoral_followups WHERE id = $1 AND ($2::boolean OR owner_user_id = $3)', [followupId, canReadAll(principal), principal.userId])).rowCount);
}

function cardSelect() {
  return `SELECT followups.*, users.name AS owner_name,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', tags.id, 'name', tags.name, 'color', tags.color) ORDER BY tags.name)
      FROM followup_tag_assignments AS assignments JOIN followup_tags AS tags ON tags.id = assignments.tag_id AND tags.tenant_id = assignments.tenant_id
      WHERE assignments.followup_id = followups.id), '[]'::jsonb) AS tags,
    COALESCE((SELECT jsonb_agg(links.conversation_id ORDER BY links.created_at) FROM followup_conversations AS links WHERE links.followup_id = followups.id), '[]'::jsonb) AS conversation_ids,
    (SELECT count(*)::integer FROM followup_notes AS notes WHERE notes.followup_id = followups.id AND (notes.author_user_id = $2 OR ($3::boolean AND notes.visibility = 'team'))) AS note_count
    FROM pastoral_followups AS followups JOIN users ON users.id = followups.owner_user_id AND users.tenant_id = followups.tenant_id`;
}
function mapStage(row: any): FollowupStageView { return { id: row.id, name: row.name, color: row.color, position: row.position, isTerminal: row.is_terminal }; }
function mapTag(row: any): FollowupTagView { return { id: row.id, name: row.name, color: row.color }; }
function mapCard(row: any): FollowupCardView { return { id: row.id, contactName: row.contact_name, contactAddress: row.contact_address, memberUserId: row.member_user_id, owner: { id: row.owner_user_id, name: row.owner_name }, stageId: row.stage_id, nextActionAt: row.next_action_at?.toISOString() ?? null, tags: row.tags, conversationIds: row.conversation_ids, noteCount: row.note_count, updatedAt: row.updated_at.toISOString() }; }
function mapNote(row: any, userId: string): FollowupNoteView { return { id: row.id, body: row.body, visibility: row.visibility, author: { id: row.author_user_id, name: row.author_name }, createdAt: row.created_at.toISOString(), own: row.author_user_id === userId }; }
