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
