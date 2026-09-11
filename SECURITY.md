# Política de segurança

Não publique vulnerabilidades em issues. Use o [relato privado de vulnerabilidade do GitHub](https://github.com/jairsantana7/igreja/security/advisories/new), incluindo impacto, reprodução mínima e versão/commit afetado. Se o formulário estiver indisponível, contate o proprietário pelo [perfil do mantenedor](https://github.com/jairsantana7) sem revelar detalhes publicamente. Não inclua credenciais ou dados pessoais reais.

O mantenedor deve manter o Private Vulnerability Reporting habilitado antes de divulgar uma instalação a terceiros. A meta é confirmar o recebimento em até sete dias corridos; prazo de correção e divulgação coordenada depende do impacto e será combinado pelo canal privado.

## Versões suportadas

| Versão | Suporte de segurança |
|---|---|
| `main` e a release mais recente | sim |
| versões anteriores | não; atualize antes de solicitar correção |

O projeto buscará confirmar o recebimento em até sete dias corridos. Prazo de correção e divulgação coordenada depende da gravidade e da disponibilidade dos mantenedores; não há SLA comercial. O crédito ao relator será combinado antes da publicação.

O projeto ainda está em fase inicial e não passou por auditoria independente. Um teste local aprovado não autoriza implantação em produção.

## Premissas obrigatórias de produção

- segredos fortes e externos ao Git;
- TLS até o proxy de borda;
- API acessível somente pelo Traefik ou rede privada;
- CIDRs oficiais da Cloudflare mantidos atualizados no Traefik;
- papel runtime sem superuser, bypass de RLS ou propriedade de tabelas;
- rate limit compartilhado quando houver mais de uma réplica;
- backup, restauração e testes RLS executados em ambiente isolado.

## Sessões do navegador

- mantenha web e API no mesmo site registrável para que `SameSite=Strict` funcione sem exceções;
- configure `SESSION_BINDING_SECRET` com pelo menos 32 caracteres, diferente do `JWT_SECRET`;
- nunca exponha o cookie de sessão ou `X-Session-Proof` em logs, telemetria, URLs ou mensagens de erro;
- respostas de autenticação devem usar `Cache-Control: no-store`;
- a prova fica em `sessionStorage`: fechar a aba exige novo login, por decisão de segurança;
- um XSS ativo ainda pode executar ações como o usuário enquanto estiver na página. Mantenha dependências atualizadas, evite HTML não confiável e preserve os cabeçalhos de segurança do Nuxt;
- mantenha a CSP sem origens adicionais desnecessárias; qualquer ampliação de `script-src`, `connect-src` ou `frame-src` exige revisão de segurança;
- revogue todas as sessões e rotacione os dois segredos se houver suspeita de vazamento das chaves do servidor.

O vínculo ao `User-Agent` e a prova dividida reduzem replay de cookie roubado, mas não substituem TLS, MFA, correção de XSS, proteção do dispositivo ou resposta a incidentes.

Consulte `docs/deployment.md` para o checklist de implantação e `docs/database-migrations.md` para backup, atualização e recuperação.
