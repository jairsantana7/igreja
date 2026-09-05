# 0008 — Nascimento no perfil complementar do membro

Status: aceita

## Contexto

A data de nascimento pode apoiar o relacionamento pastoral e estava disponível somente para os filhos. Ela é um dado pessoal que não é necessário para autenticação, inscrição em evento ou vínculo com a comunidade.

## Decisão

- A data de nascimento do membro será opcional e armazenada em `member_profiles`, não em `users`.
- Datas inexistentes ou futuras serão rejeitadas pelo domínio.
- O dado será visível com `members.profile_read` e editável com `members.profile_manage`.
- O cadastro administrativo poderá receber o perfil complementar junto da identidade e dos papéis. A persistência será atômica e exigirá também `members.profile_manage` quando esses dados forem enviados.
- A auditoria não copiará a data para a metadata do evento de auditoria.

## Alternativas consideradas

- Colocar nascimento em `users`: rejeitada porque ampliaria o acesso a um dado que não faz parte da identidade mínima.
- Tornar nascimento obrigatório: rejeitada porque não é necessário para participação e contrariaria a minimização de dados.
- Calcular e armazenar idade: rejeitada porque a idade muda com o tempo e pode ser derivada quando houver finalidade aprovada.

## Consequências

O perfil complementar passa a concentrar nascimento, endereço e composição familiar sob as mesmas permissões restritas. A instalação continua responsável por definir base legal, transparência, retenção, correção e exclusão antes da coleta em produção.
