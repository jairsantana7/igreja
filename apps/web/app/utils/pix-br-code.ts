export interface StaticPixPayloadInput {
  key: string;
  recipientName: string;
  city: string;
  amountCents: number;
  transactionId: string;
}

function bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function field(id: string, value: string): string {
  const length = bytes(value);
  if (length > 99) throw new Error(`O campo ${id} excede o limite do BR Code.`);
  return `${id}${String(length).padStart(2, '0')}${value}`;
}

function normalize(value: string, maxLength: number, fallback: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 $%*+\-./:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return normalized || fallback;
}

function crc16Ccitt(value: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildStaticPixPayload(input: StaticPixPayloadInput): string {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('O valor do PIX deve ser informado em centavos e ser positivo.');
  }
  const key = input.key.trim();
  if (!key || bytes(key) > 77) throw new Error('A chave PIX é inválida para o BR Code.');
  const merchantAccount = field('00', 'br.gov.bcb.pix') + field('01', key);
  const transactionId = normalize(input.transactionId, 25, '***');
  const payload = [
    field('00', '01'),
    field('26', merchantAccount),
    field('52', '0000'),
    field('53', '986'),
    field('54', (input.amountCents / 100).toFixed(2)),
    field('58', 'BR'),
    field('59', normalize(input.recipientName, 25, 'RECEBEDOR')),
    field('60', normalize(input.city, 15, 'CIDADE')),
    field('62', field('05', transactionId)),
  ].join('');
  const withChecksumHeader = `${payload}6304`;
  return `${withChecksumHeader}${crc16Ccitt(withChecksumHeader)}`;
}

export function pixTransactionId(publicEventId: string): string {
  return `EVT${publicEventId.replace(/[^a-z0-9]/gi, '').slice(0, 22)}`.toUpperCase();
}
