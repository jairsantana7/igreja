import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { FollowupNoteContent, FollowupStageDefinition, FollowupTagDefinition } from '../../domain/entities/pastoral-followup';

export interface FollowupStageView { id: string; name: string; color: string; position: number; isTerminal: boolean }
export interface FollowupTagView { id: string; name: string; color: string }
export interface FollowupCardView {
  id: string; contactName: string; contactAddress: string; memberUserId: string | null;
  owner: { id: string; name: string }; stageId: string; nextActionAt: string | null;
  tags: FollowupTagView[]; conversationIds: string[]; noteCount: number; updatedAt: string;
}
export interface FollowupNoteView { id: string; body: string; visibility: 'private' | 'team'; author: { id: string; name: string }; createdAt: string; own: boolean }
export interface FollowupStageChangeView { id: string; fromStage: string | null; toStage: string; changedBy: string; changedAt: string }
export interface FollowupDetailView extends FollowupCardView { notes: FollowupNoteView[]; history: FollowupStageChangeView[] }

export interface PastoralFollowupRepository {
  stages(principal: AuthenticatedPrincipal): Promise<FollowupStageView[]>;
  createStage(principal: AuthenticatedPrincipal, definition: FollowupStageDefinition): Promise<FollowupStageView>;
  tags(principal: AuthenticatedPrincipal): Promise<FollowupTagView[]>;
  createTag(principal: AuthenticatedPrincipal, definition: FollowupTagDefinition): Promise<FollowupTagView>;
  board(principal: AuthenticatedPrincipal): Promise<FollowupCardView[]>;
  detail(principal: AuthenticatedPrincipal, followupId: string): Promise<FollowupDetailView | null>;
  createFromConversation(principal: AuthenticatedPrincipal, conversationId: string): Promise<FollowupDetailView | null>;
  move(principal: AuthenticatedPrincipal, followupId: string, stageId: string): Promise<FollowupCardView | null>;
  update(principal: AuthenticatedPrincipal, followupId: string, input: { nextActionAt: string | null; tagIds: string[] }): Promise<FollowupCardView | null>;
  addNote(principal: AuthenticatedPrincipal, followupId: string, note: FollowupNoteContent): Promise<FollowupNoteView | null>;
  removeNote(principal: AuthenticatedPrincipal, followupId: string, noteId: string): Promise<boolean | null>;
}
