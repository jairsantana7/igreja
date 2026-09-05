# Regras de negócio

Este documento registra o entendimento atual e deve evoluir antes do código quando surgirem decisões novas.

## Atores

- **Admin:** usuário inicial da comunidade, com permissão para configurar papéis e criar os demais usuários.
- **Pastor:** papel inicial que recebe permissões para administrar eventos da própria comunidade.
- **Membro:** entra ou cria uma conta vinculada à comunidade e confirma inscrição em um evento publicado.
- A tela **Membros** lista as identidades da própria comunidade, inclusive administradores e pastores, conforme seus papéis.
- Somente usuários com `users.read` podem visualizar a lista de membros.
- Usuários com `users.create` e acesso à lista de papéis podem cadastrar uma pessoa com senha inicial e ao menos um papel.

## Eventos

- O pastor cria título, descrição, local, início, limite de inscrição, capacidade opcional e formulário.
- O formulário aceita inicialmente texto curto, texto longo, seleção única e caixa de confirmação.
- Um evento pode estar em `draft`, `published`, `registration_closed`, `cancelled` ou `completed`.
- Somente `published` é acessível pelo link público.
- No MVP, um evento está aberto para inscrições quando está publicado, ainda não começou e seu prazo de inscrição não venceu.
- Editar um evento preserva seu identificador e link público; a edição não altera o status de publicação.
- Cancelar exige `events.publish`, fecha imediatamente o link público e impede novas inscrições.
- O cancelamento preserva inscrições e respostas existentes para histórico e auditoria.
- Cancelar novamente um evento já cancelado é uma operação idempotente.
- Campos que já possuem respostas não podem ser removidos durante uma edição; versionamento de formulários ainda precisa de definição.
- Notificações de cancelamento não são enviadas até que canal, mensagem, tentativas e consentimentos sejam definidos.
- Fechar inscrições move apenas um evento publicado para `registration_closed`; inscrições existentes são preservadas.
- Concluir um evento é permitido a partir de `published` ou `registration_closed` e encerra sua operação.
- Eventos concluídos não podem ser cancelados. Repetir fechamento, conclusão ou cancelamento no mesmo estado é idempotente.
- As transições de ciclo de vida exigem `events.publish`; o nome do papel nunca participa dessa decisão.

## Inscrição

- O membro precisa de uma identidade autenticada antes de confirmar.
- Se ainda não tiver conta naquela comunidade, pode registrar nome, e-mail e senha no fluxo do evento.
- A combinação membro/evento é única. Repetir a confirmação devolve a inscrição existente sem duplicar.
- O backend valida campos obrigatórios e opções permitidas.
- Capacidade esgotada, lista de espera e cancelamento ainda precisam de definição detalhada.
- A contagem exibida na gestão representa inscrições confirmadas, não presença física no evento.

## Presença e check-in

- Presença é diferente de inscrição e só existe após check-in de uma inscrição confirmada.
- O MVP permite check-in manual e desfazer check-in; ambas as ações exigem `events.checkin`.
- Existe no máximo um check-in ativo por inscrição. Repetir a confirmação é idempotente.
- O registro guarda horário e operador para auditoria, sem copiar respostas do formulário.
- QR Code, convidados, check-in familiar e funcionamento offline permanecem decisões abertas; o modelo não presume essas regras.

## Versionamento de formulário

- Cada evento começa na versão 1 do formulário.
- Uma edição administrativa cria uma fotografia imutável da nova versão, mesmo quando só dados gerais do evento mudam; essa escolha favorece rastreabilidade no MVP.
- A inscrição registra a versão vigente no momento da confirmação.
- Respostas antigas continuam associadas aos campos originais. Campos respondidos ainda não podem ser removidos.
- Migração de respostas, edição retroativa e comparação visual entre versões permanecem decisões abertas.

## Comunicação

- Comunicação é um módulo do contexto de eventos, mas o transporte é sempre uma porta `JobQueue` e adaptadores de canal.
- O MVP permite preparar campanhas para inscritos confirmados, presentes ou ausentes, sem enviar diretamente no request HTTP.
- Uma campanha só muda para enfileirada depois que o adaptador de fila aceita o trabalho. Sem adaptador, a operação falha de forma explícita e o rascunho é preservado.
- Consentimento, opt-out, modelos de mensagem, custo, janela de envio e provedores oficiais permanecem decisões abertas; nenhum disparo real é habilitado por padrão.

## Modelos e recorrência

- Um evento pode ser salvo como modelo reutilizável contendo dados editoriais e o formulário, sem inscrições, auditoria ou identificadores públicos.
- Criar a partir de um modelo sempre gera um novo rascunho e exige informar uma nova data.
- Recorrência automática não é presumida: periodicidade, exceções e vínculo entre ocorrências permanecem decisões abertas.

## Segurança administrativa

- Tokens de acesso pertencem a uma sessão revogável; o banco persiste somente o identificador opaco da sessão, nunca o token.
- O usuário pode encerrar suas outras sessões. Operações administrativas de sessões exigem permissão granular.
- MFA é planejado por porta de provedor e deve ser exigível por política da comunidade antes de integrar TOTP, passkey ou fornecedor externo.
- A recuperação de emergência (`break-glass`) não usa ausência de tenant nem bypass de RLS; deverá ter identidade explícita, credencial separada e auditoria reforçada.

## Login social

- Provedores sociais são opcionais e configuráveis por implantação.
- A aplicação só confia em e-mail/subject após validação OIDC no backend.
- Admin e pastor podem configurar quais provedores sociais a comunidade pretende habilitar.
- Ativar uma configuração não instala o adaptador: o login somente pode ser oferecido quando a implantação também disponibiliza um adaptador compatível.
- Client secrets e tokens privados não são armazenados no banco; a configuração guarda somente a referência para uma variável de ambiente ou secret manager.
- A vinculação automática por e-mail e regras para contas já existentes ainda precisam de decisão; até lá, nenhum adaptador social é habilitado por padrão.

## Pagamentos

- Pagamentos são opcionais e não fazem parte da confirmação gratuita de presença.
- A comunidade pode configurar PIX manual ou indicar um gateway por uma chave de provedor estável.
- A chave PIX, o nome do recebedor e a cidade são dados administrativos visíveis somente a usuários autorizados.
- Credenciais privadas de gateway não são armazenadas no banco; somente sua referência externa é persistida.
- A configuração não cobra nem confirma pagamentos até existir um adaptador de `PaymentGateway` instalado e uma regra de cobrança vinculada ao evento.
- Taxas, reembolsos, conciliação, expiração, webhooks e efeitos de falha ainda precisam de definição antes de ativar cobrança real.

## Questões abertas

- Um membro pode participar de várias comunidades com uma única conta global?
- Eventos podem aceitar inscrição sem senha (magic link)?
- Quem pode editar/publicar além do pastor?
- Quais regras valem para capacidade, convidados, pagamentos e cancelamento?
- Quais dados e consentimentos LGPD são obrigatórios por formulário?
- Quais regras complementares serão usadas no check-in: QR Code, convidados, família e modo offline?
- Como eventos definem preço, gratuidade, lotes e política de reembolso?
- Quais gateways e provedores OIDC serão mantidos oficialmente pelo projeto?
- Quando uma edição deve ou não criar uma nova versão do formulário?
- Qual política de MFA e recuperação de emergência será adotada antes da produção?

## Acesso inicial

- O seed de desenvolvimento cria somente um usuário `admin`.
- A senha inicial deve ser alterada ou substituída por fluxo de convite antes de produção.
- Papéis `pastor` e `member` são modelos de sistema; novos usuários recebem um ou mais papéis pelo módulo de acesso.

## Controle de funcionalidades

- Toda funcionalidade autenticada é associada a uma permissão granular no formato `context.action`.
- Papéis apenas agrupam permissões; regras de negócio não verificam nomes como `admin` ou `pastor`.
- Usuários com `roles.manage` podem liberar ou fechar funcionalidades alterando as permissões de um papel.
- A autorização do backend consulta as atribuições atuais; esconder menus ou botões no frontend não é uma fronteira de segurança.
- Login local, consulta de evento publicado, cadastro pelo formulário público e health check são exceções públicas explícitas.
- Ainda precisa ser definida uma recuperação administrativa segura caso todos os papéis percam `roles.manage`.

## Auditoria e observabilidade

- Criações, edições e exclusões em tabelas críticas geram eventos de auditoria com tenant, ator, ação, tipo de recurso e horário.
- A auditoria não copia senhas, tokens, respostas de formulários nem valores alterados.
- Registros de auditoria são imutáveis para o papel runtime da aplicação.
- Logs operacionais e ferramentas como Sentry são observabilidade; não substituem a trilha persistente de auditoria.
- Cache não é usado para decisões de autorização. Alterações de permissão devem valer na próxima requisição ao backend.

## Imagens dos eventos

- Um evento pode receber várias imagens durante sua criação.
- O modo `hero` usa a primeira imagem como capa ampla; `carousel` apresenta todas as imagens em uma galeria navegável; `fixed` usa a primeira imagem como fundo fixo da página pública.
- A interpretação dos modos é uma decisão inicial de apresentação e pode evoluir sem alterar a propriedade dos arquivos.
- O binário não fica no PostgreSQL. `event_media` guarda metadados e uma chave opaca do adaptador de armazenamento.
- Upload exige `events.update`, valida tipo e assinatura JPEG, PNG ou WebP e limita cada arquivo a 5 MiB por segurança operacional.
- Uma mídia só pode ser lida publicamente quando pertence a um evento publicado.
- Ainda precisa ser definido pelo produto se haverá imagem destacada manual, reordenação e exclusão de mídias na primeira versão.
