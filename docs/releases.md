# Releases e compatibilidade

O projeto usa Versionamento Semântico enquanto a API pública e o processo de instalação evoluem. Durante `0.x`, mudanças incompatíveis ainda podem ocorrer em versões menores, mas precisam aparecer no `CHANGELOG.md` e possuir caminho de migração.

## Política

- `PATCH`: correções compatíveis, segurança e documentação sem mudança de contrato.
- `MINOR`: funcionalidades compatíveis; em `0.x`, pode conter mudança incompatível explicitamente destacada.
- `MAJOR`: contrato estável incompatível depois da versão `1.0.0`.
- migrations são forward-only e nunca são alteradas após uma release.
- uma release informa compatibilidade mínima de Node.js, pnpm, PostgreSQL e Redis.

## Processo do mantenedor

1. Atualize `CHANGELOG.md`, documentação, `.env.example` e migrations.
2. Execute `pnpm check` com banco limpo e com cópia atualizada da versão anterior.
3. Teste backup/restauração e o procedimento de upgrade.
4. Atualize a versão dos pacotes e crie tag assinada `vX.Y.Z`.
5. Publique notas com mudanças, riscos, instruções de migration e rollback da aplicação.
6. Anexe artefatos reproduzíveis ou referências imutáveis de imagem quando existirem.

Não publique release quando o schema novo exigir a aplicação nova e o rollback não estiver documentado. Prefira mudanças expand/contract distribuídas em mais de uma versão.

