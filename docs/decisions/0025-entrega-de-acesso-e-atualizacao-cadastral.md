# 0025 — Entrega de acesso e atualização cadastral

Status: aceita

## Contexto

Ao cadastrar um membro, pedir que o pastor invente e compartilhe uma senha cria senhas previsíveis, aumenta trabalho operacional e mistura cadastro com entrega de credencial. Ao mesmo tempo, parte da comunidade prefere receber o acesso pessoalmente pelo WhatsApp e poderá usar login social quando um adapter estiver habilitado.

## Decisão

- O cadastro administrativo completo exige nome, e-mail, WhatsApp, papéis e os dados complementares que o operador desejar informar. A senha inicial deixa de ser digitada pelo operador.
- A aplicação gera uma frase-senha temporária legível, com palavras sem acento e números, e mantém o mínimo de dez caracteres aceito pela autenticação local.
- Cada cadastro gera uma entrega de acesso com validade de sete dias e um link individual para o próprio membro revisar o perfil, informar os dados faltantes e escolher uma nova senha.
- A fila de entrega mostra somente membro, WhatsApp, estado e validade. Senha e token ficam juntos em um payload AES-256-GCM criptografado com uma chave exclusiva de implantação.
- Somente quem possui `members.credentials_manage` pode listar, revelar, marcar como entregue ou revogar uma entrega. Controllers e casos de uso repetem a autorização.
- Revelar não envia automaticamente: a interface monta uma mensagem para o operador copiar e enviar manualmente. A ação é auditada por mudança de estado, sem copiar senha, token ou texto preparado.
- A entrega pode estar `pending`, `revealed`, `delivered`, `completed` ou `revoked`. Concluir o formulário ou revogar remove definitivamente o payload criptografado.
- O link usa UUID opaco mais token aleatório. O banco armazena somente SHA-256 do token e resolve o tenant por uma função pública estreita; tentativas são limitadas por IP real.
- O formulário público atualiza somente o usuário vinculado à entrega, dentro do tenant resolvido no servidor. O usuário não escolhe `tenant_id` ou `user_id`.
- O consentimento para novas conversas no WhatsApp permanece separado e desmarcado. Informar o telefone ou receber uma credencial não concede consentimento.
- Login social continua atrás de `ExternalIdentityProvider`. A entrega local não conhece Google, Microsoft ou outro fornecedor e poderá deixar de exibir a senha quando esse fluxo estiver operacional.

## Consequências

- A fila é estado de negócio no PostgreSQL, não um job no broker. Redis, BullMQ e adapters de mensageria nunca recebem a senha temporária.
- A frase-senha é um caminho temporário e amigável, não uma redução das proteções de sessão ou rate limit.
- Entregas expiradas deixam de ser reveladas e links expirados deixam de atualizar dados. Uma futura ação de reemissão deverá gerar novo segredo e invalidar o anterior.
- O projeto precisa configurar `MEMBER_ONBOARDING_SECRET` em produção e protegê-lo como segredo de implantação.

