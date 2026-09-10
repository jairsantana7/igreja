import { describe, expect, it } from 'vitest';
import { buildPublicEventUrl, publicEventQrFilename } from '../app/utils/public-event-share';

describe('compartilhamento do evento público', () => {
  it('monta o link no domínio atual sem duplicar barras', () => {
    expect(buildPublicEventUrl('https://comunidade.example/', '40000000-0000-4000-8000-000000000001'))
      .toBe('https://comunidade.example/e/40000000-0000-4000-8000-000000000001');
  });

  it('gera um nome de arquivo legível e seguro para o QR Code', () => {
    expect(publicEventQrFilename('Encontro de Famílias 2026!')).toBe('qrcode-encontro-de-familias-2026.png');
  });
});
