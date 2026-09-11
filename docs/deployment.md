# Implantação e operação

Este guia descreve o contrato de uma instalação. Ele não certifica o projeto para produção: a versão inicial ainda exige uma avaliação de risco da organização e os controles listados em `SECURITY.md`.

## Topologia mínima

```text
navegador -> Cloudflare -> Traefik -> Nuxt / NestJS
                                      |-> PostgreSQL
                                      |-> Redis -> worker de jobs
                                      |          -> worker WhatsApp (opcional)
                                      `-> object storage privado
```

- Nuxt e API devem permanecer no mesmo site registrável para preservar `SameSite=Strict`.
- PostgreSQL, Redis, API e workers não devem possuir portas públicas.
- Somente o job de deploy recebe `DATABASE_MIGRATION_URL`.
- API e workers recebem o papel runtime e compartilham o mesmo backend privado de mídia.

## Estado dos componentes

| Componente | Estado | Regra operacional |
|---|---|---|
| API e web | MVP | execute atrás de TLS e proxy confiável |
| PostgreSQL/RLS | implementado | use papéis separados e teste restauração |
| rate limit | memória | mantenha uma réplica da API até instalar storage compartilhado |
| BullMQ/Redis | opcional | execute worker separado e Redis com `noeviction` |
| mídia local | desenvolvimento | em produção, registre object storage privado |
| WhatsApp via QR | experimental | uma réplica do worker; não usar para campanhas em massa |
| Meta Cloud API | parcial | consulta templates; envio/webhook/Embedded Signup ainda não concluídos |

## Configuração obrigatória

Parta de `.env.example`, use um secret manager e mantenha os valores fora da imagem e do Git. No mínimo:

- `APP_NAME`, origens exatas em `CORS_ORIGIN` e URL pública da API no build do Nuxt;
- `DATABASE_URL` para runtime e `DATABASE_MIGRATION_URL` somente no job de atualização;
- `JWT_SECRET`, `SESSION_BINDING_SECRET` e `MEMBER_ONBOARDING_SECRET` distintos e aleatórios;
- redes exatas do proxy em `TRUST_PROXY`, nunca `true`;
- `REDIS_URL` quando BullMQ ou o barramento realtime distribuído estiver habilitado;
- backend compartilhado para mídia antes de separar API e workers em hosts diferentes.

Variáveis do conector WhatsApp e suas restrições estão em `.env.example` e `docs/integrations.md`.

## Sequência de deploy

1. Construa artefatos imutáveis com `pnpm install --frozen-lockfile` e `pnpm build`.
2. Execute `pnpm check` contra um PostgreSQL descartável.
3. Faça backup e prove a restauração.
4. Execute `pnpm db:migrate` como job único.
5. Suba API e web; valide `GET /api/health` pela rede interna e pela borda.
6. Suba o worker BullMQ quando habilitado.
7. Suba uma única réplica do worker WhatsApp quando habilitado.
8. Faça um teste funcional: login, leitura autorizada, tentativa negada e gravação auditada.

Não use `pnpm db:seed` em produção. O seed contém identidades e credenciais conhecidas de demonstração.

## Proxy e IP real

Siga integralmente `docs/reverse-proxy-security.md`. O Traefik deve confiar apenas nos CIDRs atuais da Cloudflare, substituir cabeçalhos encaminhados e ser o único caminho até a API. Para SSE em `/api/conversations/events`, desabilite buffering e preserve conexões longas.

## Saúde, logs e observabilidade

- `GET /api/health` é a sonda HTTP; use timeouts e reinício gradual.
- Não transforme a sonda pública em diagnóstico de banco ou exposição de versões.
- Envie logs pelo adapter `ApplicationLogger`, com ambiente e correlation ID no adapter da instalação.
- Remova cookies, `X-Session-Proof`, tokens, QR codes, telefones, conteúdo de mensagens e payloads pessoais.
- Configure alertas para erros 5xx, fila parada, jobs esgotados, desconexão de canais, uso de disco e falhas de backup.
- Auditoria de domínio não substitui logs operacionais e não deve ser exportada integralmente como breadcrumb.

## Backup e recuperação

Defina RPO/RTO da instalação, retenção e criptografia antes do lançamento. Inclua PostgreSQL, objetos de mídia e, quando necessário, Redis persistente. Restaure periodicamente em ambiente isolado, valide contagens e execute os testes RLS. Consulte `docs/database-migrations.md` para a política de rollback.

## Escala e limites atuais

Não escale a API horizontalmente enquanto o throttler estiver em memória: cada réplica permitiria um limite independente. O worker WhatsApp também permanece em uma réplica até existir lock distribuído por canal. Antes de múltiplas instâncias, implemente e teste storage compartilhado do throttler, barramento realtime Redis, object storage e idempotência dos consumidores.

## Checklist de liberação

- [ ] domínios, TLS, firewall e cadeia Cloudflare/Traefik validados;
- [ ] secrets exclusivos e política de rotação registrada;
- [ ] papéis PostgreSQL revisados (`NOSUPERUSER`, `NOBYPASSRLS`);
- [ ] backup restaurado e migrations executadas em cópia;
- [ ] `pnpm check` e testes RLS aprovados;
- [ ] storage e workers compatíveis com a topologia escolhida;
- [ ] retenção de dados pessoais, consentimentos e resposta a incidentes definidas;
- [ ] limitações experimentais comunicadas aos operadores.

