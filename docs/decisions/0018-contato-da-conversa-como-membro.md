# 0018 — Converter contato da conversa em membro

Status: aceita

## Contexto

Uma pessoa pode iniciar uma conversa pelo WhatsApp antes de possuir cadastro na comunidade. Repetir manualmente nome e número na tela de membros aumenta o trabalho pastoral e deixa a conversa sem vínculo com a identidade criada.

O modelo atual exige um e-mail para criar uma identidade local e gera a entrega temporária conforme a decisão 0025. Receber uma mensagem também não equivale a autorizar que a comunidade inicie contatos futuros.

## Decisão

- Uma conversa acessível e ainda sem membro pode originar um cadastro pela própria central.
- O WhatsApp vem da conversa no servidor. O nome de perfil do WhatsApp é preenchido como sugestão editável, e a interface exige que o operador confirme o nome e informe o e-mail.
- O novo usuário recebe somente o papel de sistema `member` da mesma comunidade.
- Criar usuário, perfil, atribuir papel e vincular a conversa acontece em uma única transação com o contexto RLS do usuário autenticado.
- Se a conversa já participa de um acompanhamento pastoral, esse acompanhamento recebe o mesmo vínculo de membro na transação.
- O consentimento para comunicação pelo WhatsApp permanece desativado. A iniciativa anterior do contato autoriza responder à conversa existente, não iniciar comunicações futuras.
- A operação exige simultaneamente `conversations.read`, `users.create` e `members.profile_manage`, tanto no controller quanto no caso de uso.
- E-mail já cadastrado não é associado automaticamente. Um fluxo explícito para vincular uma conversa a um membro existente será decidido separadamente.
- Depois da criação, a correção do nome permanece disponível no perfil do membro somente para quem possui `users.update`, separada da permissão sobre dados complementares.

## Alternativas consideradas

- Criar uma identidade sem e-mail ou com e-mail sintético: descartado porque produziria credenciais ambíguas e dados que não vieram do usuário.
- Conceder consentimento automaticamente: descartado porque uma mensagem recebida não comprova autorização para novos contatos.
- Criar o membro e vincular a conversa em operações separadas: descartado porque falhas intermediárias deixariam estado parcial.

## Consequências

- O pastor reaproveita o número já capturado, corrige o nome quando necessário e informa o e-mail.
- Papéis personalizados podem liberar ou remover cada capacidade envolvida sem condicionais pelo nome do papel.
- Contatos cujo número ainda esteja representado apenas por identificador interno do provedor precisam ser resolvidos antes do cadastro.
