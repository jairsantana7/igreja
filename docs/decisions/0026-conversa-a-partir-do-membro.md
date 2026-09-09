# 0026 — Conversa a partir do membro

Status: aceita

## Contexto

O cadastro de membros e a central de conversas são pontos de entrada diferentes para a mesma relação pastoral. Exigir que o operador procure manualmente uma conversa pelo nome ou número cria atrito e pode abrir atendimentos duplicados.

## Decisão

- A listagem de membros oferece a ação `Conversar` quando o usuário possui acesso à central ou permissão para iniciar um atendimento.
- A ação procura primeiro a conversa vinculada mais recente que esteja no escopo do operador: própria, atribuída a ele ou supervisionável com `conversations.read_all`.
- Se encontrar, abre diretamente a conversa existente. Retomar um atendimento existente não cria novo contato e não altera o consentimento do membro.
- Se não encontrar, direciona ao perfil do membro para escolher um canal e iniciar uma conversa nova.
- Uma conversa nova continua exigindo `members.profile_read`, `conversations.reply`, número cadastrado e consentimento explícito do membro para o WhatsApp.
- A busca exige `conversations.read` no controller e no caso de uso. RLS e o escopo de propriedade dos canais continuam sendo aplicados pelo repositório.

## Consequências

- O módulo de membros não conhece Baileys, Meta ou outro provedor; ele usa a porta `ConversationRepository`.
- A ausência de uma conversa acessível não revela a existência de atendimentos pertencentes a outro pastor.
- O operador recebe uma explicação quando ainda precisa obter consentimento ou configurar um canal.
