export interface GeneratedMemberOnboardingSecrets {
  temporaryPassword: string;
  invitationToken: string;
  tokenHash: string;
  encryptedPayload: Buffer;
}

export interface MemberOnboardingSecurity {
  generate(): GeneratedMemberOnboardingSecrets;
  hashToken(token: string): string;
  reveal(encryptedPayload: Buffer): { temporaryPassword: string; invitationToken: string };
}
