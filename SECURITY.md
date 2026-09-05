# Política de segurança

Não publique vulnerabilidades em issues. Envie um relato privado aos mantenedores do repositório, incluindo impacto, reprodução mínima e versão afetada. Não inclua credenciais ou dados pessoais.

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
