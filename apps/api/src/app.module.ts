import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TOKENS } from './application/ports/tokens';
import { CreateEventUseCase, GetDashboardUseCase, GetPublicEventUseCase, ListEventsUseCase } from './application/use-cases/event.use-cases';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RegisterForEventUseCase, SignUpForEventUseCase } from './application/use-cases/registration.use-cases';
import { CreateRoleUseCase, CreateUserUseCase, GetAccessControlUseCase, ListMembersUseCase } from './application/use-cases/access-control.use-cases';
import { PostgresDatabase } from './infrastructure/database/postgres.database';
import { PostgresAuthenticationRepository } from './infrastructure/repositories/postgres-authentication.repository';
import { PostgresEventRepository } from './infrastructure/repositories/postgres-event.repository';
import { PostgresRegistrationRepository } from './infrastructure/repositories/postgres-registration.repository';
import { PostgresAccessControlRepository } from './infrastructure/repositories/postgres-access-control.repository';
import { BcryptPasswordHasher } from './infrastructure/security/bcrypt-password-hasher';
import { JoseTokenService } from './infrastructure/security/jose-token.service';
import { AuthController } from './presentation/http/controllers/auth.controller';
import { DashboardController } from './presentation/http/controllers/dashboard.controller';
import { HealthController } from './presentation/http/controllers/health.controller';
import { PublicEventsController } from './presentation/http/controllers/public-events.controller';
import { AccessControlController } from './presentation/http/controllers/access-control.controller';
import { JwtAuthGuard } from './presentation/http/guards/jwt-auth.guard';
import { PermissionsGuard } from './presentation/http/guards/permissions.guard';
import { RealIpThrottlerGuard } from './presentation/http/guards/real-ip-throttler.guard';

@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }])],
  controllers: [AuthController, DashboardController, PublicEventsController, AccessControlController, HealthController],
  providers: [
    PostgresDatabase,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: APP_GUARD, useClass: RealIpThrottlerGuard },
    { provide: TOKENS.passwordHasher, useClass: BcryptPasswordHasher },
    { provide: TOKENS.tokenService, useClass: JoseTokenService },
    {
      provide: TOKENS.authRepository,
      useFactory: (database: PostgresDatabase) => new PostgresAuthenticationRepository(database),
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
      provide: TOKENS.loginUseCase,
      useFactory: (auth: PostgresAuthenticationRepository, passwords: BcryptPasswordHasher, tokens: JoseTokenService) =>
        new LoginUseCase(auth, passwords, tokens),
      inject: [TOKENS.authRepository, TOKENS.passwordHasher, TOKENS.tokenService],
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
      ) => new SignUpForEventUseCase(publicEvents, registrations, passwords, tokens),
      inject: [TOKENS.publicEventUseCase, TOKENS.registrationRepository, TOKENS.passwordHasher, TOKENS.tokenService],
    },
    {
      provide: TOKENS.registerForEventUseCase,
      useFactory: (publicEvents: GetPublicEventUseCase, registrations: PostgresRegistrationRepository) =>
        new RegisterForEventUseCase(publicEvents, registrations),
      inject: [TOKENS.publicEventUseCase, TOKENS.registrationRepository],
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
      provide: TOKENS.createRoleUseCase,
      useFactory: (access: PostgresAccessControlRepository) => new CreateRoleUseCase(access),
      inject: [TOKENS.accessControlRepository],
    },
    {
      provide: TOKENS.createUserUseCase,
      useFactory: (access: PostgresAccessControlRepository, passwords: BcryptPasswordHasher) => new CreateUserUseCase(access, passwords),
      inject: [TOKENS.accessControlRepository, TOKENS.passwordHasher],
    },
  ],
})
export class AppModule {}
