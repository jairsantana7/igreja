# Solução de problemas

## A aplicação não abre

- confirme `docker compose ps` e a saúde de PostgreSQL/Redis;
- valide Node.js 22.19+ e pnpm 11+;
- confira se web usa `http://localhost:3100` e API `http://localhost:3101/api`;
- execute `pnpm db:migrate` antes do seed.

## A migration informa schema anterior ao ledger

Não apague o volume. Faça backup e siga a adoção única em `docs/database-migrations.md`. Se a verificação de marcos falhar, preserve o banco e compare-o em ambiente isolado.

## Login retorna 401 após fechar a aba

É esperado: o cookie é `HttpOnly`, mas a prova complementar fica apenas no `sessionStorage`. Faça login novamente. Se o erro ocorre sem fechar a aba, confirme que web e API estão no mesmo site e que proxy/cabeçalhos não removem cookie ou `X-Session-Proof`.

## Rate limit usa o IP do proxy

Revise a cadeia em `docs/reverse-proxy-security.md`. Não adicione cabeçalhos públicos diretamente ao código e nunca use `TRUST_PROXY=true`.

## Conversas não atualizam em tempo real

Confirme que `/api/conversations/events` não sofre buffering no proxy. Em múltiplos processos, use o barramento Redis configurado pela instalação; o barramento em memória não atravessa réplicas.

## WhatsApp via QR não conecta ou não restaura

- API e worker precisam da mesma `CONVERSATION_SESSION_ENCRYPTION_KEY`;
- habilite BullMQ, Redis e `WHATSAPP_WEB_DRIVER=baileys`;
- execute somente uma réplica do worker;
- canais pareados antes da importação de histórico podem exigir desconexão e novo pareamento;
- não publique QR, estado de sessão ou logs internos do driver em uma issue.

## Imagens funcionam na API, mas não no worker

API e worker não compartilham o mesmo `MediaStorage`. O disco local serve apenas ao desenvolvimento ou processos no mesmo filesystem; use object storage privado em produção.

Ao abrir uma issue, remova tokens, cookies, telefones, nomes, mensagens, dumps e qualquer dado de produção. Inclua versão, sistema operacional, passos mínimos, resultado esperado e logs sanitizados.

