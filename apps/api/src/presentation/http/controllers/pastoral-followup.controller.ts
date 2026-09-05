import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { TOKENS } from '../../../application/ports/tokens';
import type { AddFollowupNoteUseCase, CreateFollowupFromConversationUseCase, CreateFollowupStageUseCase, CreateFollowupTagUseCase, GetFollowupUseCase, ListFollowupBoardUseCase, ListFollowupStagesUseCase, ListFollowupTagsUseCase, MoveFollowupUseCase, RemoveFollowupNoteUseCase, UpdateFollowupUseCase } from '../../../application/use-cases/pastoral-followup.use-cases';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequireAnyPermission, RequirePermissions } from '../decorators/require-permissions.decorator';
import { AddFollowupNoteDto, CreateFollowupFromConversationDto, CreateFollowupStageDto, CreateFollowupTagDto, MoveFollowupDto, UpdateFollowupDto } from '../dto/pastoral-followup.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller('followups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PastoralFollowupController {
  constructor(
    @Inject(TOKENS.listFollowupBoardUseCase) private readonly listBoard: ListFollowupBoardUseCase,
    @Inject(TOKENS.getFollowupUseCase) private readonly getOne: GetFollowupUseCase,
    @Inject(TOKENS.createFollowupFromConversationUseCase) private readonly createFromConversation: CreateFollowupFromConversationUseCase,
    @Inject(TOKENS.moveFollowupUseCase) private readonly moveOne: MoveFollowupUseCase,
    @Inject(TOKENS.updateFollowupUseCase) private readonly updateOne: UpdateFollowupUseCase,
    @Inject(TOKENS.listFollowupStagesUseCase) private readonly listStages: ListFollowupStagesUseCase,
    @Inject(TOKENS.createFollowupStageUseCase) private readonly createStage: CreateFollowupStageUseCase,
    @Inject(TOKENS.listFollowupTagsUseCase) private readonly listTags: ListFollowupTagsUseCase,
    @Inject(TOKENS.createFollowupTagUseCase) private readonly createTag: CreateFollowupTagUseCase,
    @Inject(TOKENS.addFollowupNoteUseCase) private readonly addNote: AddFollowupNoteUseCase,
    @Inject(TOKENS.removeFollowupNoteUseCase) private readonly removeNote: RemoveFollowupNoteUseCase,
  ) {}

  @Get() @RequireAnyPermission(PERMISSIONS.followupsReadOwn, PERMISSIONS.followupsReadAll)
  board(@CurrentPrincipal() principal: AuthenticatedPrincipal) { return this.listBoard.execute(principal); }
  @Get('stages') @RequireAnyPermission(PERMISSIONS.followupsReadOwn, PERMISSIONS.followupsReadAll)
  stages(@CurrentPrincipal() principal: AuthenticatedPrincipal) { return this.listStages.execute(principal); }
  @Post('stages') @RequirePermissions(PERMISSIONS.followupsPipelineManage)
  addStage(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateFollowupStageDto) { return this.createStage.execute(principal, dto); }
  @Get('tags') @RequireAnyPermission(PERMISSIONS.followupsReadOwn, PERMISSIONS.followupsReadAll)
  tags(@CurrentPrincipal() principal: AuthenticatedPrincipal) { return this.listTags.execute(principal); }
  @Post('tags') @RequirePermissions(PERMISSIONS.followupsPipelineManage)
  addTag(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateFollowupTagDto) { return this.createTag.execute(principal, dto); }
  @Post() @RequirePermissions(PERMISSIONS.followupsManage)
  create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateFollowupFromConversationDto) { return this.createFromConversation.execute(principal, dto.conversationId); }
  @Get(':followupId') @RequireAnyPermission(PERMISSIONS.followupsReadOwn, PERMISSIONS.followupsReadAll)
  detail(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('followupId', new ParseUUIDPipe()) id: string) { return this.getOne.execute(principal, id); }
  @Put(':followupId/stage') @RequirePermissions(PERMISSIONS.followupsManage)
  move(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('followupId', new ParseUUIDPipe()) id: string, @Body() dto: MoveFollowupDto) { return this.moveOne.execute(principal, id, dto.stageId); }
  @Put(':followupId') @RequirePermissions(PERMISSIONS.followupsManage)
  update(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('followupId', new ParseUUIDPipe()) id: string, @Body() dto: UpdateFollowupDto) { return this.updateOne.execute(principal, id, dto); }
  @Post(':followupId/notes') @RequirePermissions(PERMISSIONS.followupsNotesManage)
  note(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('followupId', new ParseUUIDPipe()) id: string, @Body() dto: AddFollowupNoteDto) { return this.addNote.execute(principal, id, dto); }
  @Delete(':followupId/notes/:noteId') @RequirePermissions(PERMISSIONS.followupsNotesManage)
  deleteNote(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('followupId', new ParseUUIDPipe()) id: string, @Param('noteId', new ParseUUIDPipe()) noteId: string) { return this.removeNote.execute(principal, id, noteId); }
}
