import { describe, expect, it } from 'vitest';
import { buildStaticPixPayload, pixTransactionId } from '../app/utils/pix-br-code';

describe('BR Code estático para PIX', () => {
  it('inclui chave, valor em reais, recebedor normalizado e checksum', () => {
    const payload = buildStaticPixPayload({
      key: 'recebimentos@example.test',
      recipientName: 'Comunidade São José',
      city: 'São Paulo',
      amountCents: 2500,
      transactionId: 'evento-123',
    });
    expect(payload).toContain('0014br.gov.bcb.pix');
    expect(payload).toContain('0125recebimentos@example.test');
    expect(payload).toContain('540525.00');
    expect(payload).toContain('5919COMUNIDADE SAO JOSE');
    expect(payload).toContain('6009SAO PAULO');
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);
  });

  it('gera identificador curto e estável para o evento', () => {
    expect(pixTransactionId('40000000-0000-4000-8000-000000000001')).toBe('EVT4000000000004000800000');
  });

  it('rejeita valor nulo ou negativo', () => {
    expect(() => buildStaticPixPayload({ key: 'x', recipientName: 'Nome', city: 'Cidade', amountCents: 0, transactionId: 'x' }))
      .toThrow('positivo');
  });
});
