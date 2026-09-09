import type { StoredMedia } from '../ports/media-storage.port';

export type ConversationMediaKind = 'image' | 'audio';
export const MAX_CONVERSATION_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_CONVERSATION_AUDIO_SIZE = 20 * 1024 * 1024;
export const MAX_CONVERSATION_MEDIA_SIZE = MAX_CONVERSATION_AUDIO_SIZE;

const SUPPORTED_MIME_TYPES: StoredMedia['mimeType'][] = [
  'image/jpeg', 'image/png', 'image/webp', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac',
];

export function canonicalConversationMimeType(value: string | null | undefined): StoredMedia['mimeType'] | null {
  const mimeType = value?.split(';')[0]?.trim().toLowerCase();
  if (mimeType === 'image/jpg') return 'image/jpeg';
  return SUPPORTED_MIME_TYPES.includes(mimeType as StoredMedia['mimeType'])
    ? mimeType as StoredMedia['mimeType']
    : null;
}

export function conversationMediaKind(mimeType: StoredMedia['mimeType']): ConversationMediaKind {
  return mimeType.startsWith('image/') ? 'image' : 'audio';
}

export function conversationMediaSizeLimit(kind: ConversationMediaKind): number {
  return kind === 'image' ? MAX_CONVERSATION_IMAGE_SIZE : MAX_CONVERSATION_AUDIO_SIZE;
}

export function matchesConversationMediaSignature(content: Buffer, mimeType: StoredMedia['mimeType']): boolean {
  if (mimeType === 'image/jpeg') return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  if (mimeType === 'image/png') return content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return content.length >= 12 && content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mimeType === 'audio/ogg') return content.length >= 4 && content.subarray(0, 4).toString('ascii') === 'OggS';
  if (mimeType === 'audio/mp4') return content.length >= 12 && content.subarray(4, 8).toString('ascii') === 'ftyp';
  if (mimeType === 'audio/aac') return content.length >= 2 && content[0] === 0xff && (content[1]! & 0xf6) === 0xf0;
  return content.length >= 3 && (content.subarray(0, 3).toString('ascii') === 'ID3' || (content[0] === 0xff && (content[1]! & 0xe0) === 0xe0));
}
