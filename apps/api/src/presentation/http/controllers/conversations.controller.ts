import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Inject, type MessageEvent, Param, ParseUUIDPipe, Post, Put, Res, Sse, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable } from 'rxjs';
import { TOKENS } from '../../../application/ports/tokens';
import type { ConnectConversationChannelUseCase, CreateConversationChannelUseCase, CreateConversationUseCase, CreateMemberFromConversationUseCase, DeleteConversationChannelUseCase, DisconnectConversationChannelUseCase, GetConversationChannelConnectionUseCase, GetConversationMediaUseCase, GetConversationMessagesUseCase, ListConversationChannelsUseCase, ListConversationsUseCase, ReplyConversationUseCase, RequestConversationHistorySyncUseCase, SendConversationMediaUseCase, UpdateConversationStatusUseCase } from '../../../application/use-cases/conversation.use-cases';
import { MAX_CONVERSATION_MEDIA_SIZE } from '../../../application/services/conversation-media.policy';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequireAnyPermission, RequirePermissions } from '../decorators/require-permissions.decorator';
import { CreateConversationChannelDto, CreateConversationDto, CreateMemberFromConversationDto, ReplyConversationDto, SendConversationMediaDto, UpdateConversationStatusDto } from '../dto/conversation.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import type { ListWhatsAppTemplatesUseCase, SyncWhatsAppTemplatesUseCase } from '../../../application/use-cases/whatsapp-template.use-cases';
import { Throttle } from '@nestjs/throttler';
import type { ConversationRealtimeBus } from '../../../application/ports/conversation-realtime.port';

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
    @Inject(TOKENS.createMemberFromConversationUseCase) private readonly createMemberFromConversation: CreateMemberFromConversationUseCase,
    @Inject(TOKENS.getConversationMessagesUseCase) private readonly getMessages: GetConversationMessagesUseCase,
    @Inject(TOKENS.requestConversationHistorySyncUseCase) private readonly requestHistorySync: RequestConversationHistorySyncUseCase,
    @Inject(TOKENS.getConversationMediaUseCase) private readonly getMedia: GetConversationMediaUseCase,
    @Inject(TOKENS.replyConversationUseCase) private readonly replyConversation: ReplyConversationUseCase,
    @Inject(TOKENS.sendConversationMediaUseCase) private readonly sendMedia: SendConversationMediaUseCase,
    @Inject(TOKENS.updateConversationStatusUseCase) private readonly updateStatus: UpdateConversationStatusUseCase,
    @Inject(TOKENS.listWhatsAppTemplatesUseCase) private readonly listWhatsAppTemplates: ListWhatsAppTemplatesUseCase,
    @Inject(TOKENS.syncWhatsAppTemplatesUseCase) private readonly syncWhatsAppTemplates: SyncWhatsAppTemplatesUseCase,
    @Inject(TOKENS.conversationRealtimeBus) private readonly realtime: ConversationRealtimeBus,
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

  @Sse('conversations/events')
  @Header('Cache-Control', 'private, no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermissions(PERMISSIONS.conversationsRead)
  events(@CurrentPrincipal() principal: AuthenticatedPrincipal): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const unsubscribe = this.realtime.subscribe(principal.tenantId, (resource) => {
        subscriber.next({ type: `${resource}.changed`, data: { resource } });
      });
      const heartbeat = setInterval(() => subscriber.next({ type: 'heartbeat', data: {} }), 20_000);
      const revalidate = setTimeout(() => subscriber.complete(), 60_000);
      return () => {
        unsubscribe();
        clearInterval(heartbeat);
        clearTimeout(revalidate);
      };
    });
  }

  @Post('conversations')
  @RequirePermissions(PERMISSIONS.conversationsReply)
  start(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateConversationDto) { return this.createConversation.execute(principal, dto); }

  @Post('conversations/:conversationId/member')
  @RequirePermissions(PERMISSIONS.conversationsRead, PERMISSIONS.usersCreate, PERMISSIONS.memberProfilesManage)
  addMember(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('conversationId', new ParseUUIDPipe()) id: string, @Body() dto: CreateMemberFromConversationDto) {
    return this.createMemberFromConversation.execute(principal, id, dto);
  }

  @Get('conversations/:conversationId/messages')
  @RequirePermissions(PERMISSIONS.conversationsRead)
  messages(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('conversationId', new ParseUUIDPipe()) id: string) { return this.getMessages.execute(principal, id); }

  @Post('conversations/:conversationId/history-sync')
  @HttpCode(202)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions(PERMISSIONS.conversationsRead)
  syncHistory(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('conversationId', new ParseUUIDPipe()) id: string) {
    return this.requestHistorySync.execute(principal, id);
  }

  @Get('conversations/:conversationId/media/:mediaId')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.conversationsRead)
  async media(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Res({ passthrough: true }) response: { contentType(type: string): void },
  ) {
    const media = await this.getMedia.execute(principal, conversationId, mediaId);
    response.contentType(media.mimeType);
    return new StreamableFile(media.content);
  }

  @Post('conversations/:conversationId/messages')
  @RequirePermissions(PERMISSIONS.conversationsReply)
  reply(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('conversationId', new ParseUUIDPipe()) id: string, @Body() dto: ReplyConversationDto) { return this.replyConversation.execute(principal, id, dto.body); }

  @Post('conversations/:conversationId/media')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermissions(PERMISSIONS.conversationsReply)
  @UseInterceptors(FileInterceptor('media', { limits: { fileSize: MAX_CONVERSATION_MEDIA_SIZE } }))
  sendAttachment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: SendConversationMediaDto,
  ) {
    if (!file) throw new BadRequestException('Selecione uma imagem ou um áudio para enviar.');
    return this.sendMedia.execute(principal, conversationId, {
      content: file.buffer,
      mimeType: file.mimetype,
      caption: dto.caption,
    });
  }

  @Put('conversations/:conversationId/status')
  @RequirePermissions(PERMISSIONS.conversationsAssign)
  status(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('conversationId', new ParseUUIDPipe()) id: string, @Body() dto: UpdateConversationStatusDto) { return this.updateStatus.execute(principal, id, dto.status); }
}
