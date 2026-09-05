import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TOKENS } from './application/ports/tokens';
import { CancelEventUseCase, CloseEventRegistrationsUseCase, CompleteEventUseCase, CreateEventUseCase, GetDashboardUseCase, GetEventUseCase, GetPublicEventUseCase, ListEventCollaboratorCandidatesUseCase, ListEventsUseCase, UpdateEventCollaboratorsUseCase, UpdateEventUseCase } from './application/use-cases/event.use-cases';
import { CheckInRegistrationUseCase, CreateEventCommunicationUseCase, CreateEventTemplateUseCase, ListEventCommunicationsUseCase, ListEventRegistrationsUseCase, ListEventTemplatesUseCase, QueueEventCommunicationUseCase, UndoRegistrationCheckInUseCase } from './application/use-cases/event-operations.use-cases';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RegisterForEventUseCase, SignUpForEventUseCase } from './application/use-cases/registration.use-cases';
import { CreateRoleUseCase, CreateUserUseCase, GetAccessControlUseCase, ListMembersUseCase, UpdateRolePermissionsUseCase } from './application/use-cases/access-control.use-cases';
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
import { LocalMediaStorage } from './infrastructure/storage/local-media.storage';
import { PostgresEventMediaRepository } from './infrastructure/repositories/postgres-event-media.repository';
import { EventMediaController, PublicEventMediaController } from './presentation/http/controllers/event-media.controller';
import { GetPublicEventMediaUseCase, UploadEventMediaUseCase } from './application/use-cases/event-media.use-cases';
import { PostgresEventCommunicationRepository, PostgresEventOperationsRepository, PostgresEventTemplateRepository } from './infrastructure/repositories/postgres-event-operations.repository';
import { EventOperationsController } from './presentation/http/controllers/event-operations.controller';
import { PostgresSessionRepository } from './infrastructure/repositories/postgres-session.repository';
import { ListSessionsUseCase, RevokeCurrentSessionUseCase, RevokeOtherSessionsUseCase } from './application/use-cases/session.use-cases';
import { SessionsController } from './presentation/http/controllers/sessions.controller';
import { PostgresConversationRepository } from './infrastructure/repositories/postgres-conversation.repository';
import { ConversationsController } from './presentation/http/controllers/conversations.controller';
import { CreateConversationChannelUseCase, CreateConversationUseCase, GetConversationMessagesUseCase, ListConversationChannelsUseCase, ListConversationsUseCase, ReplyConversationUseCase, UpdateConversationStatusUseCase } from './application/use-cases/conversation.use-cases';
import { PostgresMemberProfileRepository } from './infrastructure/repositories/postgres-member-profile.repository';
import { PostgresMemberOnboardingRepository } from './infrastructure/repositories/postgres-member-onboarding.repository';
import { MemberProfilesController } from './presentation/http/controllers/member-profiles.controller';
import { GetMemberProfileUseCase, UpdateMemberProfileUseCase } from './application/use-cases/member-profile.use-cases';

@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }])],
  controllers: [AuthController, DashboardController, PublicEventsController, EventMediaController, PublicEventMediaController, EventOperationsController, ConversationsController, MemberProfilesController, SessionsController, AccessControlController, CommunitySettingsController, AuditTrailController, HealthController],
  providers: [
    PostgresDatabase,
    JwtAuthGuard,
    PermissionsGuard,
    ApplicationExceptionFilter,
    { provide: APP_GUARD, useClass: RealIpThrottlerGuard },
    { provide: TOKENS.passwordHasher, useClass: BcryptPasswordHasher },
    { provide: TOKENS.tokenService, useClass: JoseTokenService },
    { provide: TOKENS.sessionSecurity, useClass: HmacSessionSecurity },
    { provide: TOKENS.applicationLogger, useClass: NestApplicationLogger },
    { provide: TOKENS.cacheStore, useClass: NoopCacheStore },
    { provide: TOKENS.jobQueue, useClass: DisabledJobQueue },
    { provide: TOKENS.mediaStorage, useClass: LocalMediaStorage },
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
      useFactory: (database: PostgresDatabase) => new PostgresConversationRepository(database),
      inject: [PostgresDatabase],
    },
    {
      provide: TOKENS.memberProfileRepository,
      useFactory: (database: PostgresDatabase) => new PostgresMemberProfileRepository(database),
      inject: [PostgresDatabase],
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
      useFactory: (communications: PostgresEventCommunicationRepository, queue: DisabledJobQueue) => new QueueEventCommunicationUseCase(communications, queue),
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
      provide: TOKENS.replyConversationUseCase,
      useFactory: (conversations: PostgresConversationRepository, queue: DisabledJobQueue) => new ReplyConversationUseCase(conversations, queue),
      inject: [TOKENS.conversationRepository, TOKENS.jobQueue],
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
      useFactory: (onboarding: PostgresMemberOnboardingRepository, passwords: BcryptPasswordHasher) => new CreateUserUseCase(onboarding, passwords),
      inject: [TOKENS.memberOnboardingRepository, TOKENS.passwordHasher],
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
  ],
})
export class AppModule {}
