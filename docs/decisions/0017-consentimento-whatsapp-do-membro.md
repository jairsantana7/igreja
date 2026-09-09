# ADR 0017 — Consentimento de WhatsApp do membro

## Contexto

O perfil complementar já aceita um WhatsApp reutilizável nas inscrições. A comunidade precisa iniciar conversas individuais a partir desse perfil sem transformar a simples entrega do número em autorização de contato.

## Decisão

- Número e autorização são dados distintos. A autorização começa desativada e só pode ser alterada pelo próprio membro no fluxo autenticado de inscrição.
- WhatsApp e autorização aparecem em qualquer evento; dados familiares continuam condicionados à configuração de inscrição familiar.
- Conceder autorização exige um número válido. Remover o número pelo cadastro administrativo revoga uma autorização ativa.
- O perfil registra o estado atual, o instante da concessão atual/mais recente e o instante da última revogação. As alterações continuam cobertas pela auditoria existente de `member_profiles`, sem copiar dados pessoais para a metadata.
- O cadastro administrativo exibe o estado, mas não pode ativá-lo em nome do membro.
- A ação administrativa de iniciar conversa usa o membro como fonte do nome e número e exige simultaneamente `members.profile_read` e `conversations.reply`. O canal continua sujeito ao seu escopo de propriedade.
- A autorização vale somente para conversa individual iniciada pela comunidade. Mensagens iniciadas pelo contato podem ser respondidas sem autorização prévia.

## Fora do escopo

- A autorização não habilita campanhas, lembretes ou envio em massa.
- Texto jurídico definitivo, base legal, retenção, exportação, exclusão e opt-out por mensagem precisam de validação antes de produção.
- Não será guardado texto livre de consentimento; a interface usa uma declaração versionável pelo código nesta etapa do MVP.

## Consequências

- Instalações existentes começam com autorização desativada.
- O caso de uso impede contato proativo quando falta número ou autorização, mesmo que um cliente tente contornar a interface.
- Como os dados permanecem em `member_profiles`, valem a mesma transação com tenant, RLS forçada, FK composta e trilha de auditoria já existentes.
