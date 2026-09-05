# 0006 — Perfil complementar de membros

Status: aceita

## Contexto

Informações opcionais de endereço e composição familiar podem apoiar o cuidado pastoral, mas não são necessárias para autenticação ou inscrição e incluem dados pessoais de adultos e menores.

## Decisão

- O perfil complementar será separado de `users` e não bloqueará cadastro ou confirmação de evento.
- Endereço terá campos estruturados opcionais.
- Filhos serão registros próprios com nome e nascimento opcional; “possui filhos” será derivado da lista.
- Leitura e edição usarão `members.profile_read` e `members.profile_manage`, independentes de `users.read`.
- A primeira interface será administrativa. Autoatendimento do membro aguarda regra de consentimento e correção.
- Auditoria registrará somente ator, ação, tipo e identificador, sem valores pessoais.

## Alternativas consideradas

- Colocar todos os campos em `users`: rejeitada porque amplia acesso e mistura identidade com relacionamento pastoral.
- Guardar filhos em JSON: rejeitada porque dificulta integridade, evolução e exclusão individual.
- Tornar o perfil obrigatório na inscrição: rejeitada por minimização de dados e por não ser necessário ao evento.
- Adicionar observações livres sobre menores: rejeitada até haver finalidade, governança e proteção adequadas.

## Consequências

O projeto ganha tabelas e permissões específicas, com mais responsabilidade de governança. Instalações não devem ativar a coleta em produção sem definir base legal, transparência, retenção, acesso, exportação e exclusão.
