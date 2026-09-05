# 0005 — Sessão dividida no navegador

Status: aceita

## Contexto

O frontend mantinha o JWT em `localStorage` e o enviava como Bearer. Um XSS poderia copiar essa credencial completa e reutilizá-la fora do navegador até a expiração ou revogação.

## Decisão

- O JWT será transportado apenas em cookie `HttpOnly`, `SameSite=Strict`, com `Secure` em produção e sem atributo `Domain`.
- Uma prova aleatória de 256 bits será entregue uma vez ao cliente e mantida em `sessionStorage`. Somente seu HMAC será persistido em `auth_sessions`.
- Toda rota autenticada exigirá simultaneamente cookie, `X-Session-Proof` e a mesma assinatura HMAC do `User-Agent` observada no login.
- O token JWT continuará apontando para uma sessão revogável e terá validade absoluta de oito horas.
- O servidor aceitará credenciais em requests CORS somente para origens explicitamente configuradas.
- A migração revogará sessões anteriores, que não possuem prova, em vez de criar uma compatibilidade insegura.
- O IP real não será parte bloqueante da assinatura. Ele muda com frequência em redes móveis e já possui uso separado no rate limit atrás da cadeia de proxies confiáveis.

## Alternativas consideradas

- Manter Bearer no `localStorage`: rejeitada porque forma uma credencial completa acessível a JavaScript.
- Usar somente cookie `HttpOnly`: rejeitada porque um cookie copiado ainda seria reutilizável e requests mutáveis precisariam de uma defesa CSRF adicional.
- Vincular ao IP completo: rejeitada pelo alto risco de expulsar usuários legítimos e pela facilidade de mudança de rede.
- Renovar tokens automaticamente: adiada até definir duração, rotação, detecção de reutilização e experiência entre abas.

## Consequências

Cookie ou prova isolados não bastam para replay. O cabeçalho customizado também impede CSRF tradicional em navegadores. Fechar a aba remove a prova e exige autenticação novamente; abas novas não herdam necessariamente a sessão. Um XSS ativo ainda pode agir dentro da página e precisa ser tratado por codificação segura, cabeçalhos, atualizações e revisão de dependências.
