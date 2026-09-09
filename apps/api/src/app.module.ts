import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TOKENS } from './application/ports/tokens';
import { CancelEventUseCase, CloseEventRegistrationsUseCase, CompleteEventUseCase, CreateEventUseCase, GetDashboardUseCase, GetEventUseCase, GetPublicEventUseCase, ListEventCollaboratorCandidatesUseCase, ListEventsUseCase, UpdateEventCollaboratorsUseCase, UpdateEventUseCase } from './application/use-cases/event.use-cases';
import { CheckInParticipantUseCase, CheckInRegistrationUseCase, CreateEventCommunicationUseCase, CreateEventTemplateUseCase, ListEventCommunicationsUseCase, ListEventRegistrationsUseCase, ListEventTemplatesUseCase, QueueEventCommunicationUseCase, UndoParticipantCheckInUseCase, UndoRegistrationCheckInUseCase } from './application/use-cases/event-operations.use-cases';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { GetEventRegistrationContextUseCase, RegisterForEventUseCase, SignUpForEventUseCase } from './application/use-cases/registration.use-cases';
import { CreateRoleUseCase, CreateUserUseCase, GetAccessControlUseCase, ListMembersUseCase, UpdateRolePermissionsUseCase, UpdateUserNameUseCase } from './application/use-cases/access-control.use-cases';
import { PostgresDatabase } from './infrastructure/database/postgres.database';
import { PostgresAuthenticationRepository } from './infrastructure/repositories/postgres-authentication.repository';
import { PostgresEventRepository } from './infrastructure/repositories/postgres-event.repository';
import { PostgresRegistrationRepository } from './infrastructure/repositories/postgres-registration.repository';
import { PostgresAccessControlRepository } from './infrastructure/repositories/postgres-access-control.repository';
import { BcryptPasswordHasher } from './infrastructure/security/bcrypt-password-hasher';
import { JoseTokenService } from './infrastructure/security/jose-token.service';
import { HmacSessionSecurity } from './infrastructure/security/hmac-session-security';
import { AuthController } from './presentation/http/controllers/auth.controller';
import { DashboardController } from './presentation/http/controllers/dashboard.controller';
import { HealthController } from './presentation/http/controllers/health.controller';
import { PublicEventsController } from './presentation/http/controllers/public-events.controller';
import { AccessControlController } from './presentation/http/controllers/access-control.controller';
import { JwtAuthGuard } from './presentation/http/guards/jwt-auth.guard';
import { PermissionsGuard } from './presentation/http/guards/permissions.guard';
import { RealIpThrottlerGuard } from './presentation/http/guards/real-ip-throttler.guard';
import { PostgresCommunitySettingsRepository } from './infrastructure/repositories/postgres-community-settings.repository';
import { GetCommunitySettingsUseCase, UpdateCommunitySettingsUseCase } from './application/use-cases/community-settings.use-cases';
import { CommunitySettingsController } from './presentation/http/controllers/community-settings.controller';
import { PostgresAuditTrailRepository } from './infrastructure/repositories/postgres-audit-trail.repository';
import { AuditTrailController } from './presentation/http/controllers/audit-trail.controller';
import { ListAuditEventsUseCase } from './application/use-cases/audit-trail.use-case';
import { NestApplicationLogger } from './infrastructure/observability/nest-application.logger';
import { NoopCacheStore } from './infrastructure/cache/noop-cache.store';
import { ApplicationExceptionFilter } from './presentation/http/application-exception.filter';
import { DisabledJobQueue } from './infrastructure/queue/disabled-job.queue';
import { BullMqJobQueue } from './infrastructure/queue/bullmq-job.queue';
import type { JobQueue } from './application/ports/job-queue.port';
import type { ConversationProviderCatalog, ConversationProviderStateStore } from './application/ports/conversation.port';
import type { ConversationRealtimeBus } from './application/ports/conversation-realtime.port';
import type { ApplicationLogger } from './application/ports/application-logger.port';
import { LocalMediaStorage } from './infrastructure/storage/local-media.storage';
import { PostgresEventMediaRepository } from './infrastructure/repositories/postgres-event-media.repository';
import { EventMediaController, PublicEventMediaController } from './presentation/http/controllers/event-media.controller';
import { GetPublicEventMediaUseCase, UploadEventMediaUseCase } from './application/use-cases/event-media.use-cases';
import { CreateGalleryUseCase, DeleteGalleryPhotoUseCase, GetGalleryMediaUseCase, GetGalleryUseCase, GetPublicGalleryMediaUseCase, GetPublicGalleryUseCase, GetSharedGalleryMediaUseCase, GetSharedGalleryUseCase, ListGalleriesUseCase, ListGalleryEventsUseCase, ReorderGalleryPhotosUseCase, ReuseGalleryPhotoInEventUseCase, SetGalleryStatusUseCase, UpdateGalleryPhotoUseCase, UpdateGalleryUseCase, UploadGalleryPhotosUseCase } from './application/use-cases/event-gallery.use-cases';
import { PostgresEventGalleryRepository } from './infrastructure/repositories/postgres-event-gallery.repository';
import { SharpGalleryImageProcessor } from './infrastructure/media/sharp-gallery-image.processor';
import { EventGalleryController, PublicEventGalleryController } from './presentation/http/controllers/event-gallery.controller';
import { PostgresEventCommunicationRepository, PostgresEventOperationsRepository, PostgresEventTemplateRepository } from './infrastructure/repositories/postgres-event-operations.repository';
import { EventOperationsController } from './presentation/http/controllers/event-operations.controller';
import { PostgresSessionRepository } from './infrastructure/repositories/postgres-session.repository';
import { GetCurrentPrincipalUseCase, ListSessionsUseCase, RevokeCurrentSessionUseCase, RevokeOtherSessionsUseCase } from './application/use-cases/session.use-cases';
import { SessionsController } from './presentation/http/controllers/sessions.controller';
import { PostgresConversationRepository } from './infrastructure/repositories/postgres-conversation.repository';
import { ConversationsController } from './presentation/http/controllers/conversations.controller';
import { ConnectConversationChannelUseCase, CreateConversationChannelUseCase, CreateConversationUseCase, CreateMemberFromConversationUseCase, DeleteConversationChannelUseCase, DisconnectConversationChannelUseCase, GetConversationChannelConnectionUseCase, GetConversationMediaUseCase, GetConversationMessagesUseCase, ListConversationChannelsUseCase, ListConversationsUseCase, ReactConversationMessageUseCase, ReplyConversationUseCase, RequestConversationHistorySyncUseCase, SendConversationMediaUseCase, UpdateConversationStatusUseCase } from './application/use-cases/conversation.use-cases';
import { PostgresMemberProfileRepository } from './infrastructure/repositories/postgres-member-profile.repository';
import { PostgresMemberOnboardingRepository } from './infrastructure/repositories/postgres-member-onboarding.repository';
import { MemberProfilesController } from './presentation/http/controllers/member-profiles.controller';
import { GetMemberConversationUseCase, GetMemberProfileUseCase, StartMemberConversationUseCase, UpdateMemberProfileUseCase } from './application/use-cases/member-profile.use-cases';
import { PostgresWhatsAppTemplateRepository } from './infrastructure/repositories/postgres-whatsapp-template.repository';
import { EnvironmentSecretResolver } from './infrastructure/security/environment-secret-resolver';
import { MetaWhatsAppTemplateProvider } from './infrastructure/integrations/meta-whatsapp-template.provider';
import { ListWhatsAppTemplatesUseCase, SyncWhatsAppTemplatesUseCase } from './application/use-cases/whatsapp-template.use-cases';
import { env } from './infrastructure/config/env';
import { PostgresCommunicationTemplateRepository, PostgresEventReminderRepository } from './infrastructure/repositories/postgres-communication-template.repository';
import { CommunicationController } from './presentation/http/controllers/communication.controller';
import { CreateCommunicationTemplateUseCase, CreateEventReminderUseCase, DeleteEventReminderUseCase, ListCommunicationTemplatesUseCase, ListCommunicationTemplateVersionsUseCase, ListEventRemindersUseCase, SetCommunicationTemplateStatusUseCase, UpdateCommunicationTemplateUseCase, UpdateEventReminderUseCase } from './application/use-cases/communication-template.use-cases';
import { PostgresPastoralFollowupRepository } from './infrastructure/repositories/postgres-pastoral-followup.repository';
import { PastoralFollowupController } from './presentation/http/controllers/pastoral-followup.controller';
import { AddFollowupNoteUseCase, CreateFollowupFromConversationUseCase, CreateFollowupStageUseCase, CreateFollowupTagUseCase, DeleteFollowupUseCase, GetFollowupCapabilitiesUseCase, GetFollowupUseCase, ListFollowupBoardUseCase, ListFollowupStagesUseCase, ListFollowupTagsUseCase, MoveFollowupUseCase, RemoveFollowupNoteUseCase, UpdateFollowupUseCase } from './application/use-cases/pastoral-followup.use-cases';
import { AesGcmStateCipher } from './infrastructure/security/aes-gcm-state.cipher';
import { NodeMemberOnboardingSecurity } from './infrastructure/security/node-member-onboarding.security';
import type { MemberOnboardingSecurity } from './application/ports/member-onboarding-security.port';
import { MemberOnboardingController, PublicMemberOnboardingController } from './presentation/http/controllers/member-onboarding.controller';
import { CompletePublicMemberOnboardingUseCase, GetPublicMemberOnboardingUseCase, ListMemberOnboardingDeliveriesUseCase, MarkMemberOnboardingDeliveryUseCase, RevealMemberOnboardingDeliveryUseCase, RevokeMemberOnboardingDeliveryUseCase } from './application/use-cases/member-onboarding.use-cases';
import { DisabledConversationProviderStateStore } from './infrastructure/repositories/disabled-conversation-provider-state.store';
import { PostgresConversationProviderStateStore } from './infrastructure/repositories/postgres-conversation-provider-state.store';
import { ConfiguredConversationProviderCatalog } from './infrastructure/integrations/configured-conversation-provider.catalog';
import { RoutedJobQueue } from './infrastructure/queue/routed-job.queue';
import { InMemoryConversationRealtimeBus } from './infrastructure/realtime/in-memory-conversation-realtime.bus';
import { RedisConversationRealtimeBus } from './infrastructure/realtime/redis-conversation-realtime.bus';

@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }])],
  controllers: [AuthController, DashboardController, PublicEventsController, PublicMemberOnboardingController, EventMediaController, PublicEventMediaController, EventGalleryController, PublicEventGalleryController, EventOperationsController, ConversationsController, CommunicationController, PastoralFollowupController, MemberProfilesController, MemberOnboardingController, SessionsController, AccessControlController, CommunitySettingsController, AuditTrailController, HealthController],
  providers: [
    PostgresDatabase,
    JwtAuthGuard,
    PermissionsGuard,
    ApplicationExceptionFilter,
    { provide: APP_GUARD, useClass: RealIpThrottlerGuard },
    { provide: TOKENS.passwordHasher, useClass: BcryptPasswordHasher },
    {
      provide: TOKENS.memberOnboardingSecurity,
      useFactory: () => new NodeMemberOnboardingSecurity(env.memberOnboardingSecret),
    },
    { provide: TOKENS.tokenService, useClass: JoseTokenService },
    { provide: TOKENS.sessionSecurity, useClass: HmacSessionSecurity },
    { provide: TOKENS.applicationLogger, useClass: NestApplicationLogger },
    { provide: TOKENS.cacheStore, useClass: NoopCacheStore },
    {
      provide: TOKENS.conversationRealtimeBus,
      useFactory: (logger: ApplicationLogger): ConversationRealtimeBus => env.redisUrl
        ? new RedisConversationRealtimeBus(env.redisUrl, logger)
        : new InMemoryConversationRealtimeBus(),
      inject: [TOKENS.applicationLogger],
    },
    {
      provide: TOKENS.jobQueue,
      useFactory: (): JobQueue => {
        if (env.jobQueueDriver !== 'bullmq') return new DisabledJobQueue();
        const fallback = BullMqJobQueue.connect(env.redisUrl, env.jobQueueName);
        return env.whatsappWebDriver === 'disabled'
          ? fallback
          : new RoutedJobQueue(fallback, BullMqJobQueue.connect(env.redisUrl, env.whatsappQueueName));
      },
    },
    {
      provide: TOKENS.conversationProviderStateStore,
      useFactory: (database: PostgresDatabase): ConversationProviderStateStore => env.whatsappWebDriver === 'disabled'
        ? new DisabledConversationProviderStateStore()
        : new PostgresConversationProviderStateStore(database, new AesGcmStateCipher(env.conversationSessionEncryptionKey)),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.conversationProviderCatalog,
      useFactory: (): ConversationProviderCatalog => new ConfiguredConversationProviderCatalog(env.whatsappWebDriver),
    },
    { provide: TOKENS.mediaStorage, useClass: LocalMediaStorage },
    { provide: TOKENS.galleryImageProcessor, useClass: SharpGalleryImageProcessor },
    { provide: TOKENS.secretResolver, useClass: EnvironmentSecretResolver },
    {
      provide: TOKENS.authRepository,
      useFactory: (database: PostgresDatabase) => new PostgresAuthenticationRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.sessionRepository,
      useFactory: (database: PostgresDatabase) => new PostgresSessionRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.eventRepository,
      useFactory: (database: PostgresDatabase) => new PostgresEventRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.registrationRepository,
      useFactory: (database: PostgresDatabase) => new PostgresRegistrationRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.accessControlRepository,
      useFactory: (database: PostgresDatabase) => new PostgresAccessControlRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.communitySettingsRepository,
      useFactory: (database: PostgresDatabase) => new PostgresCommunitySettingsRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.auditTrailRepository,
      useFactory: (database: PostgresDatabase) => new PostgresAuditTrailRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.eventMediaRepository,
      useFactory: (database: PostgresDatabase) => new PostgresEventMediaRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.eventGalleryRepository,
      useFactory: (database: PostgresDatabase) => new PostgresEventGalleryRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.eventOperationsRepository,
      useFactory: (database: PostgresDatabase) => new PostgresEventOperationsRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.eventCommunicationRepository,
      useFactory: (database: PostgresDatabase) => new PostgresEventCommunicationRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.eventTemplateRepository,
      useFactory: (database: PostgresDatabase) => new PostgresEventTemplateRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.conversationRepository,
      useFactory: (database: PostgresDatabase, states: ConversationProviderStateStore, realtime: ConversationRealtimeBus) => new PostgresConversationRepository(database, states, realtime),
      inject: [PostgresDatabase, TOKENS.conversationProviderStateStore, TOKENS.conversationRealtimeBus],
    },
    {
      provide: TOKENS.memberProfileRepository,
      useFactory: (database: PostgresDatabase) => new PostgresMemberProfileRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.whatsappTemplateRepository,
      useFactory: (database: PostgresDatabase) => new PostgresWhatsAppTemplateRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.communicationTemplateRepository,
      useFactory: (database: PostgresDatabase) => new PostgresCommunicationTemplateRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.eventReminderRepository,
      useFactory: (database: PostgresDatabase) => new PostgresEventReminderRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.pastoralFollowupRepository,
      useFactory: (database: PostgresDatabase) => new PostgresPastoralFollowupRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.whatsappTemplateProvider,
      useFactory: (secrets: EnvironmentSecretResolver) => new MetaWhatsAppTemplateProvider(secrets, env.metaGraphApiVersion),
      inject: [TOKENS.secretResolver],
    },
    {
      provide: TOKENS.memberOnboardingRepository,
      useFactory: (database: PostgresDatabase) => new PostgresMemberOnboardingRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.loginUseCase,
      useFactory: (auth: PostgresAuthenticationRepository, passwords: BcryptPasswordHasher, tokens: JoseTokenService, sessions: PostgresSessionRepository, security: HmacSessionSecurity) =>
        new LoginUseCase(auth, passwords, tokens, sessions, security),
      inject: [TOKENS.authRepository, TOKENS.passwordHasher, TOKENS.tokenService, TOKENS.sessionRepository, TOKENS.sessionSecurity],
    },
    {
      provide: TOKENS.dashboardUseCase,
      useFactory: (events: PostgresEventRepository) => new GetDashboardUseCase(events),
      inject: [TOKENS.eventRepository],
    },
    {
      provide: TOKENS.listEventsUseCase,
      useFactory: (events: PostgresEventRepository) => new ListEventsUseCase(events),
      inject: [TOKENS.eventRepository],
    },
    {
      provide: TOKENS.createEventUseCase,
      useFactory: (events: PostgresEventRepository) => new CreateEventUseCase(events),
      inject: [TOKENS.eventRepository],
    },
    {
      provide: TOKENS.getEventUseCase,
      useFactory: (events: PostgresEventRepository) => new GetEventUseCase(events),
      inject: [TOKENS.eventRepository],
    },
    {
      provide: TOKENS.updateEventUseCase,
      useFactory: (events: PostgresEventRepository) => new UpdateEventUseCase(events),
      inject: [TOKENS.eventRepository],
    },
    {
      provide: TOKENS.cancelEventUseCase,
      useFactory: (events: PostgresEventRepository) => new CancelEventUseCase(events),
      inject: [TOKENS.eventRepository],
    },
    {
      provide: TOKENS.closeEventRegistrationsUseCase,
      useFactory: (events: PostgresEventRepository) => new CloseEventRegistrationsUseCase(events),
      inject: [TOKENS.eventRepository],
    },
    {
      provide: TOKENS.completeEventUseCase,
      useFactory: (events: PostgresEventRepository) => new CompleteEventUseCase(events),
      inject: [TOKENS.eventRepository],
    },
    {
      provide: TOKENS.updateEventCollaboratorsUseCase,
      useFactory: (events: PostgresEventRepository) => new UpdateEventCollaboratorsUseCase(events),
      inject: [TOKENS.eventRepository],
    },
    {
      provide: TOKENS.listEventCollaboratorCandidatesUseCase,
      useFactory: (events: PostgresEventRepository) => new ListEventCollaboratorCandidatesUseCase(events),
      inject: [TOKENS.eventRepository],
    },
    {
      provide: TOKENS.listEventRegistrationsUseCase,
      useFactory: (operations: PostgresEventOperationsRepository) => new ListEventRegistrationsUseCase(operations),
      inject: [TOKENS.eventOperationsRepository],
    },
    {
      provide: TOKENS.checkInRegistrationUseCase,
      useFactory: (operations: PostgresEventOperationsRepository) => new CheckInRegistrationUseCase(operations),
      inject: [TOKENS.eventOperationsRepository],
    },
    {
      provide: TOKENS.undoRegistrationCheckInUseCase,
      useFactory: (operations: PostgresEventOperationsRepository) => new UndoRegistrationCheckInUseCase(operations),
      inject: [TOKENS.eventOperationsRepository],
    },
    {
      provide: TOKENS.checkInParticipantUseCase,
      useFactory: (operations: PostgresEventOperationsRepository) => new CheckInParticipantUseCase(operations),
      inject: [TOKENS.eventOperationsRepository],
    },
    {
      provide: TOKENS.undoParticipantCheckInUseCase,
      useFactory: (operations: PostgresEventOperationsRepository) => new UndoParticipantCheckInUseCase(operations),
      inject: [TOKENS.eventOperationsRepository],
    },
    {
      provide: TOKENS.listEventCommunicationsUseCase,
      useFactory: (communications: PostgresEventCommunicationRepository) => new ListEventCommunicationsUseCase(communications),
      inject: [TOKENS.eventCommunicationRepository],
    },
    {
      provide: TOKENS.createEventCommunicationUseCase,
      useFactory: (communications: PostgresEventCommunicationRepository) => new CreateEventCommunicationUseCase(communications),
      inject: [TOKENS.eventCommunicationRepository],
    },
    {
      provide: TOKENS.queueEventCommunicationUseCase,
      useFactory: (communications: PostgresEventCommunicationRepository, queue: JobQueue) => new QueueEventCommunicationUseCase(communications, queue),
      inject: [TOKENS.eventCommunicationRepository, TOKENS.jobQueue],
    },
    {
      provide: TOKENS.listEventTemplatesUseCase,
      useFactory: (templates: PostgresEventTemplateRepository) => new ListEventTemplatesUseCase(templates),
      inject: [TOKENS.eventTemplateRepository],
    },
    {
      provide: TOKENS.createEventTemplateUseCase,
      useFactory: (templates: PostgresEventTemplateRepository) => new CreateEventTemplateUseCase(templates),
      inject: [TOKENS.eventTemplateRepository],
    },
    {
      provide: TOKENS.listConversationChannelsUseCase,
      useFactory: (conversations: PostgresConversationRepository) => new ListConversationChannelsUseCase(conversations),
      inject: [TOKENS.conversationRepository],
    },
    {
      provide: TOKENS.createConversationChannelUseCase,
      useFactory: (conversations: PostgresConversationRepository) => new CreateConversationChannelUseCase(conversations),
      inject: [TOKENS.conversationRepository],
    },
    {
      provide: TOKENS.getConversationChannelConnectionUseCase,
      useFactory: (conversations: PostgresConversationRepository) => new GetConversationChannelConnectionUseCase(conversations),
      inject: [TOKENS.conversationRepository],
    },
    {
      provide: TOKENS.connectConversationChannelUseCase,
      useFactory: (conversations: PostgresConversationRepository, queue: JobQueue, providers: ConversationProviderCatalog) => new ConnectConversationChannelUseCase(conversations, queue, providers),
      inject: [TOKENS.conversationRepository, TOKENS.jobQueue, TOKENS.conversationProviderCatalog],
    },
    {
      provide: TOKENS.disconnectConversationChannelUseCase,
      useFactory: (conversations: PostgresConversationRepository, queue: JobQueue, providers: ConversationProviderCatalog) => new DisconnectConversationChannelUseCase(conversations, queue, providers),
      inject: [TOKENS.conversationRepository, TOKENS.jobQueue, TOKENS.conversationProviderCatalog],
    },
    {
      provide: TOKENS.deleteConversationChannelUseCase,
      useFactory: (conversations: PostgresConversationRepository) => new DeleteConversationChannelUseCase(conversations),
      inject: [TOKENS.conversationRepository],
    },
    {
      provide: TOKENS.listConversationsUseCase,
      useFactory: (conversations: PostgresConversationRepository) => new ListConversationsUseCase(conversations),
      inject: [TOKENS.conversationRepository],
    },
    {
      provide: TOKENS.createConversationUseCase,
      useFactory: (conversations: PostgresConversationRepository) => new CreateConversationUseCase(conversations),
      inject: [TOKENS.conversationRepository],
    },
    {
      provide: TOKENS.getConversationMessagesUseCase,
      useFactory: (conversations: PostgresConversationRepository) => new GetConversationMessagesUseCase(conversations),
      inject: [TOKENS.conversationRepository],
    },
    {
      provide: TOKENS.requestConversationHistorySyncUseCase,
      useFactory: (conversations: PostgresConversationRepository, queue: JobQueue, providers: ConversationProviderCatalog) =>
        new RequestConversationHistorySyncUseCase(conversations, queue, providers),
      inject: [TOKENS.conversationRepository, TOKENS.jobQueue, TOKENS.conversationProviderCatalog],
    },
    {
      provide: TOKENS.replyConversationUseCase,
      useFactory: (conversations: PostgresConversationRepository, queue: JobQueue) => new ReplyConversationUseCase(conversations, queue),
      inject: [TOKENS.conversationRepository, TOKENS.jobQueue],
    },
    {
      provide: TOKENS.reactConversationMessageUseCase,
      useFactory: (conversations: PostgresConversationRepository, queue: JobQueue, providers: ConversationProviderCatalog) =>
        new ReactConversationMessageUseCase(conversations, queue, providers),
      inject: [TOKENS.conversationRepository, TOKENS.jobQueue, TOKENS.conversationProviderCatalog],
    },
    {
      provide: TOKENS.sendConversationMediaUseCase,
      useFactory: (conversations: PostgresConversationRepository, storage: LocalMediaStorage, queue: JobQueue) => new SendConversationMediaUseCase(conversations, storage, queue),
      inject: [TOKENS.conversationRepository, TOKENS.mediaStorage, TOKENS.jobQueue],
    },
    {
      provide: TOKENS.updateConversationStatusUseCase,
      useFactory: (conversations: PostgresConversationRepository) => new UpdateConversationStatusUseCase(conversations),
      inject: [TOKENS.conversationRepository],
    },
    {
      provide: TOKENS.publicEventUseCase,
      useFactory: (events: PostgresEventRepository) => new GetPublicEventUseCase(events),
      inject: [TOKENS.eventRepository],
    },
    {
      provide: TOKENS.signUpForEventUseCase,
      useFactory: (
        publicEvents: GetPublicEventUseCase,
        registrations: PostgresRegistrationRepository,
        passwords: BcryptPasswordHasher,
        tokens: JoseTokenService,
        sessions: PostgresSessionRepository,
        security: HmacSessionSecurity,
      ) => new SignUpForEventUseCase(publicEvents, registrations, passwords, tokens, sessions, security),
      inject: [TOKENS.publicEventUseCase, TOKENS.registrationRepository, TOKENS.passwordHasher, TOKENS.tokenService, TOKENS.sessionRepository, TOKENS.sessionSecurity],
    },
    {
      provide: TOKENS.registerForEventUseCase,
      useFactory: (publicEvents: GetPublicEventUseCase, registrations: PostgresRegistrationRepository) =>
        new RegisterForEventUseCase(publicEvents, registrations),
      inject: [TOKENS.publicEventUseCase, TOKENS.registrationRepository],
    },
    {
      provide: TOKENS.getEventRegistrationContextUseCase,
      useFactory: (publicEvents: GetPublicEventUseCase, registrations: PostgresRegistrationRepository) =>
        new GetEventRegistrationContextUseCase(publicEvents, registrations),
      inject: [TOKENS.publicEventUseCase, TOKENS.registrationRepository],
    },
    {
      provide: TOKENS.listSessionsUseCase,
      useFactory: (sessions: PostgresSessionRepository) => new ListSessionsUseCase(sessions),
      inject: [TOKENS.sessionRepository],
    },
    {
      provide: TOKENS.revokeOtherSessionsUseCase,
      useFactory: (sessions: PostgresSessionRepository) => new RevokeOtherSessionsUseCase(sessions),
      inject: [TOKENS.sessionRepository],
    },
    {
      provide: TOKENS.revokeCurrentSessionUseCase,
      useFactory: (sessions: PostgresSessionRepository) => new RevokeCurrentSessionUseCase(sessions),
      inject: [TOKENS.sessionRepository],
    },
    {
      provide: TOKENS.getCurrentPrincipalUseCase,
      useFactory: (access: PostgresAccessControlRepository) => new GetCurrentPrincipalUseCase(access),
      inject: [TOKENS.accessControlRepository],
    },
    {
      provide: TOKENS.getAccessControlUseCase,
      useFactory: (access: PostgresAccessControlRepository) => new GetAccessControlUseCase(access),
      inject: [TOKENS.accessControlRepository],
    },
    {
      provide: TOKENS.listMembersUseCase,
      useFactory: (access: PostgresAccessControlRepository) => new ListMembersUseCase(access),
      inject: [TOKENS.accessControlRepository],
    },
    {
      provide: TOKENS.updateUserNameUseCase,
      useFactory: (access: PostgresAccessControlRepository) => new UpdateUserNameUseCase(access),
      inject: [TOKENS.accessControlRepository],
    },
    {
      provide: TOKENS.getMemberProfileUseCase,
      useFactory: (profiles: PostgresMemberProfileRepository) => new GetMemberProfileUseCase(profiles),
      inject: [TOKENS.memberProfileRepository],
    },
    {
      provide: TOKENS.updateMemberProfileUseCase,
      useFactory: (profiles: PostgresMemberProfileRepository) => new UpdateMemberProfileUseCase(profiles),
      inject: [TOKENS.memberProfileRepository],
    },
    {
      provide: TOKENS.getMemberConversationUseCase,
      useFactory: (conversations: PostgresConversationRepository) => new GetMemberConversationUseCase(conversations),
      inject: [TOKENS.conversationRepository],
    },
    {
      provide: TOKENS.startMemberConversationUseCase,
      useFactory: (profiles: PostgresMemberProfileRepository, conversations: PostgresConversationRepository) =>
        new StartMemberConversationUseCase(profiles, conversations),
      inject: [TOKENS.memberProfileRepository, TOKENS.conversationRepository],
    },
    {
      provide: TOKENS.listWhatsAppTemplatesUseCase,
      useFactory: (templates: PostgresWhatsAppTemplateRepository) => new ListWhatsAppTemplatesUseCase(templates),
      inject: [TOKENS.whatsappTemplateRepository],
    },
    {
      provide: TOKENS.syncWhatsAppTemplatesUseCase,
      useFactory: (templates: PostgresWhatsAppTemplateRepository, provider: MetaWhatsAppTemplateProvider) => new SyncWhatsAppTemplatesUseCase(templates, provider),
      inject: [TOKENS.whatsappTemplateRepository, TOKENS.whatsappTemplateProvider],
    },
    {
      provide: TOKENS.listCommunicationTemplatesUseCase,
      useFactory: (templates: PostgresCommunicationTemplateRepository) => new ListCommunicationTemplatesUseCase(templates),
      inject: [TOKENS.communicationTemplateRepository],
    },
    {
      provide: TOKENS.listCommunicationTemplateVersionsUseCase,
      useFactory: (templates: PostgresCommunicationTemplateRepository) => new ListCommunicationTemplateVersionsUseCase(templates),
      inject: [TOKENS.communicationTemplateRepository],
    },
    {
      provide: TOKENS.createCommunicationTemplateUseCase,
      useFactory: (templates: PostgresCommunicationTemplateRepository) => new CreateCommunicationTemplateUseCase(templates),
      inject: [TOKENS.communicationTemplateRepository],
    },
    {
      provide: TOKENS.updateCommunicationTemplateUseCase,
      useFactory: (templates: PostgresCommunicationTemplateRepository) => new UpdateCommunicationTemplateUseCase(templates),
      inject: [TOKENS.communicationTemplateRepository],
    },
    {
      provide: TOKENS.setCommunicationTemplateStatusUseCase,
      useFactory: (templates: PostgresCommunicationTemplateRepository) => new SetCommunicationTemplateStatusUseCase(templates),
      inject: [TOKENS.communicationTemplateRepository],
    },
    {
      provide: TOKENS.listEventRemindersUseCase,
      useFactory: (reminders: PostgresEventReminderRepository) => new ListEventRemindersUseCase(reminders),
      inject: [TOKENS.eventReminderRepository],
    },
    {
      provide: TOKENS.createEventReminderUseCase,
      useFactory: (reminders: PostgresEventReminderRepository) => new CreateEventReminderUseCase(reminders),
      inject: [TOKENS.eventReminderRepository],
    },
    {
      provide: TOKENS.updateEventReminderUseCase,
      useFactory: (reminders: PostgresEventReminderRepository) => new UpdateEventReminderUseCase(reminders),
      inject: [TOKENS.eventReminderRepository],
    },
    {
      provide: TOKENS.deleteEventReminderUseCase,
      useFactory: (reminders: PostgresEventReminderRepository) => new DeleteEventReminderUseCase(reminders),
      inject: [TOKENS.eventReminderRepository],
    },
    { provide: TOKENS.listFollowupBoardUseCase, useFactory: (repository: PostgresPastoralFollowupRepository) => new ListFollowupBoardUseCase(repository), inject: [TOKENS.pastoralFollowupRepository] },
    { provide: TOKENS.getFollowupCapabilitiesUseCase, useValue: new GetFollowupCapabilitiesUseCase() },
    { provide: TOKENS.getFollowupUseCase, useFactory: (repository: PostgresPastoralFollowupRepository) => new GetFollowupUseCase(repository), inject: [TOKENS.pastoralFollowupRepository] },
    { provide: TOKENS.createFollowupFromConversationUseCase, useFactory: (repository: PostgresPastoralFollowupRepository) => new CreateFollowupFromConversationUseCase(repository), inject: [TOKENS.pastoralFollowupRepository] },
    { provide: TOKENS.moveFollowupUseCase, useFactory: (repository: PostgresPastoralFollowupRepository) => new MoveFollowupUseCase(repository), inject: [TOKENS.pastoralFollowupRepository] },
    { provide: TOKENS.updateFollowupUseCase, useFactory: (repository: PostgresPastoralFollowupRepository) => new UpdateFollowupUseCase(repository), inject: [TOKENS.pastoralFollowupRepository] },
    { provide: TOKENS.deleteFollowupUseCase, useFactory: (repository: PostgresPastoralFollowupRepository) => new DeleteFollowupUseCase(repository), inject: [TOKENS.pastoralFollowupRepository] },
    { provide: TOKENS.listFollowupStagesUseCase, useFactory: (repository: PostgresPastoralFollowupRepository) => new ListFollowupStagesUseCase(repository), inject: [TOKENS.pastoralFollowupRepository] },
    { provide: TOKENS.createFollowupStageUseCase, useFactory: (repository: PostgresPastoralFollowupRepository) => new CreateFollowupStageUseCase(repository), inject: [TOKENS.pastoralFollowupRepository] },
    { provide: TOKENS.listFollowupTagsUseCase, useFactory: (repository: PostgresPastoralFollowupRepository) => new ListFollowupTagsUseCase(repository), inject: [TOKENS.pastoralFollowupRepository] },
    { provide: TOKENS.createFollowupTagUseCase, useFactory: (repository: PostgresPastoralFollowupRepository) => new CreateFollowupTagUseCase(repository), inject: [TOKENS.pastoralFollowupRepository] },
    { provide: TOKENS.addFollowupNoteUseCase, useFactory: (repository: PostgresPastoralFollowupRepository) => new AddFollowupNoteUseCase(repository), inject: [TOKENS.pastoralFollowupRepository] },
    { provide: TOKENS.removeFollowupNoteUseCase, useFactory: (repository: PostgresPastoralFollowupRepository) => new RemoveFollowupNoteUseCase(repository), inject: [TOKENS.pastoralFollowupRepository] },
    {
      provide: TOKENS.createRoleUseCase,
      useFactory: (access: PostgresAccessControlRepository) => new CreateRoleUseCase(access),
      inject: [TOKENS.accessControlRepository],
    },
    {
      provide: TOKENS.updateRolePermissionsUseCase,
      useFactory: (access: PostgresAccessControlRepository) => new UpdateRolePermissionsUseCase(access),
      inject: [TOKENS.accessControlRepository],
    },
    {
      provide: TOKENS.createUserUseCase,
      useFactory: (onboarding: PostgresMemberOnboardingRepository, passwords: BcryptPasswordHasher, security: MemberOnboardingSecurity) => new CreateUserUseCase(onboarding, passwords, security),
      inject: [TOKENS.memberOnboardingRepository, TOKENS.passwordHasher, TOKENS.memberOnboardingSecurity],
    },
    {
      provide: TOKENS.createMemberFromConversationUseCase,
      useFactory: (onboarding: PostgresMemberOnboardingRepository, passwords: BcryptPasswordHasher, security: MemberOnboardingSecurity) => new CreateMemberFromConversationUseCase(onboarding, passwords, security),
      inject: [TOKENS.memberOnboardingRepository, TOKENS.passwordHasher, TOKENS.memberOnboardingSecurity],
    },
    {
      provide: TOKENS.listMemberDeliveriesUseCase,
      useFactory: (onboarding: PostgresMemberOnboardingRepository) => new ListMemberOnboardingDeliveriesUseCase(onboarding),
      inject: [TOKENS.memberOnboardingRepository],
    },
    {
      provide: TOKENS.revealMemberDeliveryUseCase,
      useFactory: (onboarding: PostgresMemberOnboardingRepository, security: MemberOnboardingSecurity) => new RevealMemberOnboardingDeliveryUseCase(onboarding, security),
      inject: [TOKENS.memberOnboardingRepository, TOKENS.memberOnboardingSecurity],
    },
    {
      provide: TOKENS.markMemberDeliveryDeliveredUseCase,
      useFactory: (onboarding: PostgresMemberOnboardingRepository) => new MarkMemberOnboardingDeliveryUseCase(onboarding),
      inject: [TOKENS.memberOnboardingRepository],
    },
    {
      provide: TOKENS.revokeMemberDeliveryUseCase,
      useFactory: (onboarding: PostgresMemberOnboardingRepository) => new RevokeMemberOnboardingDeliveryUseCase(onboarding),
      inject: [TOKENS.memberOnboardingRepository],
    },
    {
      provide: TOKENS.getPublicMemberOnboardingUseCase,
      useFactory: (onboarding: PostgresMemberOnboardingRepository, security: MemberOnboardingSecurity) => new GetPublicMemberOnboardingUseCase(onboarding, security),
      inject: [TOKENS.memberOnboardingRepository, TOKENS.memberOnboardingSecurity],
    },
    {
      provide: TOKENS.completePublicMemberOnboardingUseCase,
      useFactory: (onboarding: PostgresMemberOnboardingRepository, security: MemberOnboardingSecurity, passwords: BcryptPasswordHasher) => new CompletePublicMemberOnboardingUseCase(onboarding, security, passwords),
      inject: [TOKENS.memberOnboardingRepository, TOKENS.memberOnboardingSecurity, TOKENS.passwordHasher],
    },
    {
      provide: TOKENS.getConversationMediaUseCase,
      useFactory: (conversations: PostgresConversationRepository, storage: LocalMediaStorage) => new GetConversationMediaUseCase(conversations, storage),
      inject: [TOKENS.conversationRepository, TOKENS.mediaStorage],
    },
    {
      provide: TOKENS.getCommunitySettingsUseCase,
      useFactory: (settings: PostgresCommunitySettingsRepository, cache: NoopCacheStore) => new GetCommunitySettingsUseCase(settings, cache),
      inject: [TOKENS.communitySettingsRepository, TOKENS.cacheStore],
    },
    {
      provide: TOKENS.updateCommunitySettingsUseCase,
      useFactory: (settings: PostgresCommunitySettingsRepository, cache: NoopCacheStore) => new UpdateCommunitySettingsUseCase(settings, cache),
      inject: [TOKENS.communitySettingsRepository, TOKENS.cacheStore],
    },
    {
      provide: TOKENS.listAuditEventsUseCase,
      useFactory: (audit: PostgresAuditTrailRepository) => new ListAuditEventsUseCase(audit),
      inject: [TOKENS.auditTrailRepository],
    },
    {
      provide: TOKENS.uploadEventMediaUseCase,
      useFactory: (media: PostgresEventMediaRepository, storage: LocalMediaStorage) => new UploadEventMediaUseCase(media, storage),
      inject: [TOKENS.eventMediaRepository, TOKENS.mediaStorage],
    },
    {
      provide: TOKENS.getPublicEventMediaUseCase,
      useFactory: (media: PostgresEventMediaRepository, storage: LocalMediaStorage) => new GetPublicEventMediaUseCase(media, storage),
      inject: [TOKENS.eventMediaRepository, TOKENS.mediaStorage],
    },
    { provide: TOKENS.listGalleriesUseCase, useFactory: (repository: PostgresEventGalleryRepository) => new ListGalleriesUseCase(repository), inject: [TOKENS.eventGalleryRepository] },
    { provide: TOKENS.listGalleryEventsUseCase, useFactory: (repository: PostgresEventGalleryRepository) => new ListGalleryEventsUseCase(repository), inject: [TOKENS.eventGalleryRepository] },
    { provide: TOKENS.createGalleryUseCase, useFactory: (repository: PostgresEventGalleryRepository) => new CreateGalleryUseCase(repository), inject: [TOKENS.eventGalleryRepository] },
    { provide: TOKENS.getGalleryUseCase, useFactory: (repository: PostgresEventGalleryRepository) => new GetGalleryUseCase(repository), inject: [TOKENS.eventGalleryRepository] },
    { provide: TOKENS.updateGalleryUseCase, useFactory: (repository: PostgresEventGalleryRepository) => new UpdateGalleryUseCase(repository), inject: [TOKENS.eventGalleryRepository] },
    { provide: TOKENS.setGalleryStatusUseCase, useFactory: (repository: PostgresEventGalleryRepository) => new SetGalleryStatusUseCase(repository), inject: [TOKENS.eventGalleryRepository] },
    { provide: TOKENS.uploadGalleryPhotosUseCase, useFactory: (repository: PostgresEventGalleryRepository, storage: LocalMediaStorage, queue: JobQueue, logger: ApplicationLogger) => new UploadGalleryPhotosUseCase(repository, storage, queue, logger), inject: [TOKENS.eventGalleryRepository, TOKENS.mediaStorage, TOKENS.jobQueue, TOKENS.applicationLogger] },
    { provide: TOKENS.updateGalleryPhotoUseCase, useFactory: (repository: PostgresEventGalleryRepository) => new UpdateGalleryPhotoUseCase(repository), inject: [TOKENS.eventGalleryRepository] },
    { provide: TOKENS.reorderGalleryPhotosUseCase, useFactory: (repository: PostgresEventGalleryRepository) => new ReorderGalleryPhotosUseCase(repository), inject: [TOKENS.eventGalleryRepository] },
    { provide: TOKENS.deleteGalleryPhotoUseCase, useFactory: (repository: PostgresEventGalleryRepository, storage: LocalMediaStorage) => new DeleteGalleryPhotoUseCase(repository, storage), inject: [TOKENS.eventGalleryRepository, TOKENS.mediaStorage] },
    { provide: TOKENS.getGalleryMediaUseCase, useFactory: (repository: PostgresEventGalleryRepository, storage: LocalMediaStorage) => new GetGalleryMediaUseCase(repository, storage), inject: [TOKENS.eventGalleryRepository, TOKENS.mediaStorage] },
    { provide: TOKENS.getSharedGalleryUseCase, useFactory: (repository: PostgresEventGalleryRepository) => new GetSharedGalleryUseCase(repository), inject: [TOKENS.eventGalleryRepository] },
    { provide: TOKENS.getSharedGalleryMediaUseCase, useFactory: (repository: PostgresEventGalleryRepository, storage: LocalMediaStorage) => new GetSharedGalleryMediaUseCase(repository, storage), inject: [TOKENS.eventGalleryRepository, TOKENS.mediaStorage] },
    { provide: TOKENS.getPublicGalleryUseCase, useFactory: (repository: PostgresEventGalleryRepository) => new GetPublicGalleryUseCase(repository), inject: [TOKENS.eventGalleryRepository] },
    { provide: TOKENS.getPublicGalleryMediaUseCase, useFactory: (repository: PostgresEventGalleryRepository, storage: LocalMediaStorage) => new GetPublicGalleryMediaUseCase(repository, storage), inject: [TOKENS.eventGalleryRepository, TOKENS.mediaStorage] },
    { provide: TOKENS.reuseGalleryPhotoUseCase, useFactory: (repository: PostgresEventGalleryRepository, eventMedia: PostgresEventMediaRepository, storage: LocalMediaStorage) => new ReuseGalleryPhotoInEventUseCase(repository, eventMedia, storage), inject: [TOKENS.eventGalleryRepository, TOKENS.eventMediaRepository, TOKENS.mediaStorage] },
  ],
})
export class AppModule {}
