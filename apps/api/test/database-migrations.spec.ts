import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverMigrations } from '../src/infrastructure/database/migrate';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), 'igreja-migrations-'));
  directories.push(directory);
  return directory;
}

describe('descoberta de migrations', () => {
  it('ordena migrations e calcula checksum estável ignorando arquivos auxiliares', () => {
    const directory = fixture();
    writeFileSync(join(directory, '002_second.sql'), 'SELECT 2;\n');
    writeFileSync(join(directory, '001_first.sql'), 'SELECT 1;\n');
    writeFileSync(join(directory, 'README.md'), 'ignorado');

    const migrations = discoverMigrations(directory);

    expect(migrations.map(({ name }) => name)).toEqual(['001_first.sql', '002_second.sql']);
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(migrations[0]?.checksum).toBe(discoverMigrations(directory)[0]?.checksum);
  });

  it('rejeita duas migrations com o mesmo prefixo', () => {
    const directory = fixture();
    writeFileSync(join(directory, '001_first.sql'), 'SELECT 1;\n');
    writeFileSync(join(directory, '001_other.sql'), 'SELECT 2;\n');

    expect(() => discoverMigrations(directory)).toThrow('prefixo 001');
  });
});
