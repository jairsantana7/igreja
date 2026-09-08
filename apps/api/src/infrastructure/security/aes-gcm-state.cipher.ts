import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SensitiveStateCipher } from '../../application/ports/conversation.port';

const FORMAT_VERSION = 1;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class AesGcmStateCipher implements SensitiveStateCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32 || this.key.toString('base64') !== base64Key) {
      throw new Error('A chave de estado precisa conter 32 bytes em base64.');
    }
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, cipher.getAuthTag(), encrypted]);
  }

  decrypt(ciphertext: Buffer): string {
    if (ciphertext.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH || ciphertext[0] !== FORMAT_VERSION) {
      throw new Error('Formato de estado criptografado inválido.');
    }
    const ivStart = 1;
    const tagStart = ivStart + IV_LENGTH;
    const payloadStart = tagStart + AUTH_TAG_LENGTH;
    const decipher = createDecipheriv('aes-256-gcm', this.key, ciphertext.subarray(ivStart, tagStart));
    decipher.setAuthTag(ciphertext.subarray(tagStart, payloadStart));
    return Buffer.concat([decipher.update(ciphertext.subarray(payloadStart)), decipher.final()]).toString('utf8');
  }
}
