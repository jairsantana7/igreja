import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { TOKENS } from '../../../application/ports/tokens';
import type { ConnectConversationChannelUseCase, CreateConversationChannelUseCase, CreateConversationUseCase, DeleteConversationChannelUseCase, DisconnectConversationChannelUseCase, GetConversationChannelConnectionUseCase, GetConversationMessagesUseCase, ListConversationChannelsUseCase, ListConversationsUseCase, ReplyConversationUseCase, UpdateConversationStatusUseCase } from '../../../application/use-cases/conversation.use-cases';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequireAnyPermission, RequirePermissions } from '../decorators/require-permissions.decorator';
import { CreateConversationChannelDto, CreateConversationDto, ReplyConversationDto, UpdateConversationStatusDto } from '../dto/conversation.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import type { ListWhatsAppTemplatesUseCase, SyncWhatsAppTemplatesUseCase } from '../../../application/use-cases/whatsapp-template.use-cases';
import { Throttle } from '@nestjs/throttler';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConversationsController {
  constructor(
    @Inject(TOKENS.listConversationChannelsUseCase) private readonly listChannels: ListConversationChannelsUseCase,
    @Inject(TOKENS.createConversationChannelUseCase) private readonly createChannel: CreateConversationChannelUseCase,
    @Inject(TOKENS.getConversationChannelConnectionUseCase) private readonly getConnection: GetConversationChannelConnectionUseCase,
    @Inject(TOKENS.connectConversationChannelUseCase) private readonly connectChannel: ConnectConversationChannelUseCase,
    @Inject(TOKENS.disconnectConversationChannelUseCase) private readonly disconnectChannel: DisconnectConversationChannelUseCase,
    @Inject(TOKENS.deleteConversationChannelUseCase) private readonly deleteChannel: DeleteConversationChannelUseCase,
    @Inject(TOKENS.listConversationsUseCase) private readonly listConversations: ListConversationsUseCase,
    @Inject(TOKENS.createConversationUseCase) private readonly createConversation: CreateConversationUseCase,
    @Inject(TOKENS.getConversationMessagesUseCase) private readonly getMessages: GetConversationMessagesUseCase,
    @Inject(TOKENS.replyConversationUseCase) private readonly replyConversation: ReplyConversationUseCase,
    @Inject(TOKENS.updateConversationStatusUseCase) private readonly updateStatus: UpdateConversationStatusUseCase,
    @Inject(TOKENS.listWhatsAppTemplatesUseCase) private readonly listWhatsAppTemplates: ListWhatsAppTemplatesUseCase,
    @Inject(TOKENS.syncWhatsAppTemplatesUseCase) private readonly syncWhatsAppTemplates: SyncWhatsAppTemplatesUseCase,
  ) {}

  @Get('conversation-channels')
  @RequireAnyPermission(PERMISSIONS.channelsManageOwn, PERMISSIONS.channelsManageAll, PERMISSIONS.conversationsRead)
  channels(@CurrentPrincipal() principal: AuthenticatedPrincipal) { return this.listChannels.execute(principal); }

  @Post('conversation-channels')
  @RequireAnyPermission(PERMISSIONS.channelsManageOwn, PERMISSIONS.channelsManageAll)
  addChannel(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateConversationChannelDto) { return this.createChannel.execute(principal, dto); }

  @Get('conversation-channels/:channelId/connection')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @RequireAnyPermission(PERMISSIONS.channelsManageOwn, PERMISSIONS.channelsManageAll)
  connection(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('channelId', new ParseUUIDPipe()) id: string) { return this.getConnection.execute(principal, id); }

  @Post('conversation-channels/:channelId/connection')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequireAnyPermission(PERMISSIONS.channelsManageOwn, PERMISSIONS.channelsManageAll)
  connect(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('channelId', new ParseUUIDPipe()) id: string) { return this.connectChannel.execute(principal, id); }

  @Delete('conversation-channels/:channelId/connection')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequireAnyPermission(PERMISSIONS.channelsManageOwn, PERMISSIONS.channelsManageAll)
  disconnect(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('channelId', new ParseUUIDPipe()) id: string) { return this.disconnectChannel.execute(principal, id); }

  @Delete('conversation-channels/:channelId')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequireAnyPermission(PERMISSIONS.channelsManageOwn, PERMISSIONS.channelsManageAll)
  removeChannel(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('channelId', new ParseUUIDPipe()) id: string) { return this.deleteChannel.execute(principal, id); }

  @Get('conversation-channels/:channelId/templates')
  @RequirePermissions(PERMISSIONS.whatsappTemplatesRead)
  templates(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('channelId', new ParseUUIDPipe()) id: string) { return this.listWhatsAppTemplates.execute(principal, id); }

  @Post('conversation-channels/:channelId/templates/sync')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions(PERMISSIONS.whatsappTemplatesSync)
  syncTemplates(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('channelId', new ParseUUIDPipe()) id: string) { return this.syncWhatsAppTemplates.execute(principal, id); }

  @Get('conversations')
  @RequirePermissions(PERMISSIONS.conversationsRead)
  conversations(@CurrentPrincipal() principal: AuthenticatedPrincipal) { return this.listConversations.execute(principal); }

  @Post('conversations')
  @RequirePermissions(PERMISSIONS.conversationsReply)
  start(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateConversationDto) { return this.createConversation.execute(principal, dto); }

  @Get('conversations/:conversationId/messages')
  @RequirePermissions(PERMISSIONS.conversationsRead)
  messages(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('conversationId', new ParseUUIDPipe()) id: string) { return this.getMessages.execute(principal, id); }

  @Post('conversations/:conversationId/messages')
  @RequirePermissions(PERMISSIONS.conversationsReply)
  reply(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('conversationId', new ParseUUIDPipe()) id: string, @Body() dto: ReplyConversationDto) { return this.replyConversation.execute(principal, id, dto.body); }

  @Put('conversations/:conversationId/status')
  @RequirePermissions(PERMISSIONS.conversationsAssign)
  status(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('conversationId', new ParseUUIDPipe()) id: string, @Body() dto: UpdateConversationStatusDto) { return this.updateStatus.execute(principal, id, dto.status); }
}
