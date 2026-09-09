import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import type { MemberOnboardingSecurity } from '../../application/ports/member-onboarding-security.port';

const WORDS = [
  'abrigo', 'alegria', 'amigo', 'arvore', 'barco', 'brisa', 'caminho', 'campo',
  'canto', 'casa', 'ceu', 'chave', 'colina', 'coral', 'dia', 'estrela',
  'farol', 'festa', 'flor', 'fonte', 'fruto', 'graca', 'horta', 'jardim',
  'lago', 'lar', 'lirio', 'luz', 'manha', 'mesa', 'monte', 'nuvem',
  'oliveira', 'ouro', 'pao', 'parque', 'paz', 'pedra', 'ponte', 'porto',
  'praca', 'rio', 'semente', 'serra', 'sol', 'som', 'tempo', 'terra',
  'trilha', 'vale', 'vida', 'vinha', 'vento', 'verde', 'viagem', 'vila',
  'acordo', 'encontro', 'familia', 'futuro', 'gentileza', 'esperanca', 'cuidado', 'uniao',
] as const;
const FORMAT_VERSION = 1;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class NodeMemberOnboardingSecurity implements MemberOnboardingSecurity {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (secret.length < 32) throw new Error('MEMBER_ONBOARDING_SECRET precisa ter ao menos 32 caracteres.');
    this.key = createHash('sha256').update(`member-onboarding:${secret}`, 'utf8').digest();
  }

  generate() {
    const words: string[] = [];
    while (words.length < 4) {
      const word = WORDS[randomInt(WORDS.length)]!;
      if (!words.includes(word)) words.push(word);
    }
    const temporaryPassword = `${words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join('-')}-${randomInt(1000, 10000)}`;
    const invitationToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(invitationToken);
    return {
      temporaryPassword,
      invitationToken,
      tokenHash,
      encryptedPayload: this.encrypt(JSON.stringify({ temporaryPassword, invitationToken })),
    };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  reveal(encryptedPayload: Buffer): { temporaryPassword: string; invitationToken: string } {
    const value = JSON.parse(this.decrypt(encryptedPayload)) as Record<string, unknown>;
    if (typeof value.temporaryPassword !== 'string' || typeof value.invitationToken !== 'string') {
      throw new Error('O conteúdo protegido da entrega é inválido.');
    }
    return { temporaryPassword: value.temporaryPassword, invitationToken: value.invitationToken };
  }

  private encrypt(plaintext: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, cipher.getAuthTag(), encrypted]);
  }

  private decrypt(ciphertext: Buffer): string {
    if (ciphertext.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH || ciphertext[0] !== FORMAT_VERSION) {
      throw new Error('O formato protegido da entrega é inválido.');
    }
    const ivStart = 1;
    const tagStart = ivStart + IV_LENGTH;
    const payloadStart = tagStart + AUTH_TAG_LENGTH;
    const decipher = createDecipheriv('aes-256-gcm', this.key, ciphertext.subarray(ivStart, tagStart));
    decipher.setAuthTag(ciphertext.subarray(tagStart, payloadStart));
    return Buffer.concat([decipher.update(ciphertext.subarray(payloadStart)), decipher.final()]).toString('utf8');
  }
}
