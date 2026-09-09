# 0018 — Converter contato da conversa em membro

Status: aceita

## Contexto

Uma pessoa pode iniciar uma conversa pelo WhatsApp antes de possuir cadastro na comunidade. Repetir manualmente nome e número na tela de membros aumenta o trabalho pastoral e deixa a conversa sem vínculo com a identidade criada.

O modelo atual exige e-mail e senha inicial para criar uma identidade local. Receber uma mensagem também não equivale a autorizar que a comunidade inicie contatos futuros.

## Decisão

- Uma conversa acessível e ainda sem membro pode originar um cadastro pela própria central.
- Nome e WhatsApp vêm da conversa no servidor; a interface solicita e-mail e senha inicial.
- O novo usuário recebe somente o papel de sistema `member` da mesma comunidade.
- Criar usuário, perfil, atribuir papel e vincular a conversa acontece em uma única transação com o contexto RLS do usuário autenticado.
- Se a conversa já participa de um acompanhamento pastoral, esse acompanhamento recebe o mesmo vínculo de membro na transação.
- O consentimento para comunicação pelo WhatsApp permanece desativado. A iniciativa anterior do contato autoriza responder à conversa existente, não iniciar comunicações futuras.
- A operação exige simultaneamente `conversations.read`, `users.create` e `members.profile_manage`, tanto no controller quanto no caso de uso.
- E-mail já cadastrado não é associado automaticamente. Um fluxo explícito para vincular uma conversa a um membro existente será decidido separadamente.

## Alternativas consideradas

- Criar uma identidade sem e-mail ou com e-mail sintético: descartado porque produziria credenciais ambíguas e dados que não vieram do usuário.
- Conceder consentimento automaticamente: descartado porque uma mensagem recebida não comprova autorização para novos contatos.
- Criar o membro e vincular a conversa em operações separadas: descartado porque falhas intermediárias deixariam estado parcial.

## Consequências

- O pastor reaproveita o nome e o número já capturados e completa somente as credenciais necessárias.
- Papéis personalizados podem liberar ou remover cada capacidade envolvida sem condicionais pelo nome do papel.
- Contatos cujo número ainda esteja representado apenas por identificador interno do provedor precisam ser resolvidos antes do cadastro.
