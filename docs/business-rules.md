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
- Quem cria um evento torna-se seu responsável inicial.
- Um responsável pode compartilhar o evento com colaboradores da mesma comunidade.
- Sem permissão de escopo global, usuários enxergam e administram apenas eventos próprios ou compartilhados com eles.
- Permissões `events.read_all` e `events.manage_all` permitem supervisão transversal; essa capacidade não é inferida do nome do papel.
- Transferência de responsabilidade ainda precisa de uma operação explícita e auditada; remover um pastor não transfere dados automaticamente.

## Inscrição

- O membro precisa de uma identidade autenticada antes de confirmar.
- Se ainda não tiver conta naquela comunidade, pode registrar nome, e-mail e senha no fluxo do evento.
- A combinação membro/evento é única. Repetir a confirmação devolve a inscrição existente sem duplicar.
- O backend valida campos obrigatórios e opções permitidas.
- Capacidade esgotada, lista de espera e cancelamento ainda precisam de definição detalhada.
- A contagem exibida na gestão representa inscrições confirmadas, não presença física no evento.

## Perfil complementar do membro

- Tornar-se membro ou confirmar um evento não exige preencher perfil complementar.
- A data de nascimento do membro é opcional, não pode estar no futuro e fica no perfil complementar protegido.
- O perfil pode guardar endereço estruturado opcional: CEP, logradouro, número, complemento, bairro, cidade e estado.
- A informação “possui filhos” é derivada da existência de filhos cadastrados, evitando dois dados contraditórios.
- Para cada filho, o MVP guarda somente nome e data de nascimento opcional. Não há campo livre para informações sensíveis de menores.
- Ler perfis exige `members.profile_read`; editar exige `members.profile_manage`. `users.read` isoladamente não libera endereço ou filhos.
- A listagem geral continua exibindo apenas identidade, papéis e contagens. Dados complementares aparecem somente no detalhe protegido.
- O cadastro administrativo pode criar identidade, papéis e perfil complementar na mesma transação; os dados complementares só são aceitos com `members.profile_manage`.
- Alterações são auditadas por identidade do registro, sem copiar endereço, nomes ou nascimento para a metadata de auditoria.
- Autoedição pelo membro, consentimento específico, base legal, retenção, exportação e exclusão desses dados permanecem decisões abertas antes de uso em produção.

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
- Modelos de mensagem locais pertencem à comunidade e são diferentes de modelos de evento e de templates oficiais da Meta.
- Ler modelos locais exige `communications.templates_read`; criar, editar, ativar, pausar ou arquivar exige `communications.templates_manage`.
- Cada edição cria uma versão imutável. Nome, finalidade, canal e estado ficam no modelo; assunto e conteúdo ficam na versão.
- Um modelo local pode estar em `draft`, `active` ou `archived`. Somente modelos ativos podem ser vinculados a um novo lembrete.
- O conteúdo aceita apenas variáveis documentadas de membro, evento e inscrição. Variáveis desconhecidas são rejeitadas no domínio.
- Um lembrete pertence a um evento, seleciona uma versão específica do modelo, um canal acessível, um público e uma antecedência em minutos.
- Editar um modelo não altera lembretes existentes silenciosamente. O responsável precisa atualizar a regra do evento para adotar a versão mais recente.
- Ativar ou alterar lembretes exige `events.reminders_manage` e acesso de gestão ao evento. A regra não concede acesso ao canal de outro pastor.
- Habilitação possui duas barreiras independentes: o modelo precisa estar ativo globalmente e a regra precisa estar ativa no evento.
- A interface pode preparar e ativar regras mesmo sem fila instalada, mas deve informar que não haverá entrega até um scheduler e um adapter de fila/canal serem configurados.
- Templates oficiais da Meta continuam somente como catálogo sincronizado. Usá-los em lembretes oficiais e submetê-los para aprovação permanecem bloqueados até o fluxo de conta WABA ser separado de seus números.
- Consentimento, opt-out, custo, janela de envio e disparo real permanecem decisões abertas; nenhum disparo real é habilitado por padrão.

## Central de conversas

- Cada canal de conversa pertence a um usuário responsável e a uma comunidade; o proprietário externo do número pode ser a comunidade ou o próprio pastor.
- Números institucionais são recomendados para preservar continuidade, mas números próprios são permitidos porque fazem parte do trabalho cotidiano de muitas comunidades.
- Um canal `manual` apenas organiza o número e pode abrir uma conversa direta; ele não captura uma sessão do WhatsApp Web nem declara mensagens como entregues.
- Um futuro adapter não oficial de WhatsApp Web deve ser opcional, desabilitado por padrão, isolado do processo da API e limitado a conversas individuais. Campanhas e lembretes em massa não podem usar esse adapter.
- Um usuário administra seus próprios canais com `channels.manage_own`; `channels.manage_all` permite supervisão explícita.
- Conversas podem ser vinculadas a um membro e a um evento, mas também aceitam um contato externo ainda não cadastrado.
- Uma conversa possui responsável, estado `open`, `waiting` ou `resolved`, e histórico ordenado de mensagens.
- `conversations.read` habilita a central; sem `conversations.read_all`, aparecem somente conversas de canais próprios ou atribuídas ao usuário.
- Responder exige `conversations.reply`; atribuir ou resolver exige `conversations.assign` e acesso à conversa.
- Mensagens de saída são persistidas como pendentes e somente mudam para enfileiradas após aceitação de `JobQueue`.
- O conector implementa `ConversationProvider`; casos de uso não conhecem Meta, WhatsApp Cloud API ou outro fornecedor.
- Número completo, nomes, endereços de contato e conteúdo são dados pessoais. Não entram em logs nem na metadata de auditoria e seguem a política de retenção ainda a definir.
- Client secrets e tokens ficam no secret manager. O banco guarda apenas uma referência e identificadores operacionais não secretos.
- Um canal configurado não é considerado conectado enquanto a implantação não registrar e validar um adapter oficial.
- Templates de mensagem do WhatsApp são diferentes de modelos de evento. Cada tradução aprovada pela Meta aparece como uma projeção vinculada ao canal.
- A Meta é a fonte oficial de conteúdo, categoria e status. O sistema sincroniza e armazena uma cópia para consulta, seleção futura e histórico, sem fingir aprovação local.
- Ler templates exige `whatsapp.templates_read`; sincronizar com a Meta exige `whatsapp.templates_sync` e acesso ao canal próprio ou `channels.manage_all`.
- Somente uma sincronização autenticada bem-sucedida pode mudar o canal de `configured` para `connected` nesta etapa.
- Criar, editar, excluir ou enviar templates permanece bloqueado até serem definidas regras para categorias, exemplos de variáveis, opt-in, janela de atendimento e custos.

## Acompanhamento pastoral

- Acompanhamento pastoral é um bounded context próprio. A conversa é um vínculo de comunicação e não o agregado principal.
- Um acompanhamento nasce de uma conversa acessível e preserva uma fotografia do nome e contato, podendo também apontar para um membro cadastrado.
- Cada acompanhamento possui responsável, etapa, etiquetas opcionais e data opcional para a próxima ação.
- As etapas e etiquetas pertencem à comunidade. Etapas podem ser criadas por quem administra o quadro; excluir ou reordenar etapas permanece uma decisão posterior.
- Uma conversa pertence a no máximo um acompanhamento. Um acompanhamento pode reunir várias conversas da mesma pessoa ao longo do tempo.
- Mover um cartão cria um histórico imutável com etapa anterior, nova etapa, ator e horário.
- Notas são internas e nunca são enviadas ao contato. Notas `private` são visíveis somente para o autor; notas `team` podem ser lidas por usuários autorizados que acessam o acompanhamento.
- O conteúdo de notas não é copiado para auditoria, logs, breadcrumbs ou mensagens de erro.
- `followups.read_own` limita a leitura aos acompanhamentos sob responsabilidade do usuário; `followups.read_all` habilita supervisão da comunidade.
- Alterações exigem `followups.manage` e acesso ao acompanhamento. Notas exigem adicionalmente `followups.notes_read` ou `followups.notes_manage`; administrar etapas e etiquetas exige `followups.pipeline_manage`.
- A interface descreve essas capacidades em linguagem do negócio; as chaves técnicas aparecem somente na administração de acessos.

## Cadastro progressivo, família e participantes do evento

- A conta representa uma pessoa individual. Nome e e-mail não são compartilhados por um casal ou família.
- Telefone, data de nascimento, endereço, nome do cônjuge, data de casamento e filhos formam um perfil complementar opcional e reutilizável.
- Quando o evento habilita inscrição familiar, o responsável pela inscrição assinala quais pessoas irão: ele próprio, cônjuge e filhos já apresentados no perfil.
- A inscrição pertence ao responsável, mas cada pessoa assinalada vira um participante do evento. A lista guarda uma fotografia do nome e da relação no momento da confirmação.
- O responsável pode corrigir seu perfil durante a inscrição; os dados salvos serão sugeridos em eventos futuros para evitar perguntas repetidas.
- Deve existir ao menos um participante por inscrição. Em eventos sem seleção familiar, a própria pessoa autenticada é confirmada automaticamente.
- Não haverá no MVP convite, aprovação do cônjuge ou conciliação complexa entre confirmações feitas pelas duas pessoas do casal. A família coordena quem fará a confirmação.
- Capacidade e total de pessoas consideram participantes confirmados, não apenas a quantidade de inscrições.
- A presença pode ser registrada por participante. A ação de check-in da inscrição inteira continua disponível como atalho para marcar ou desmarcar todo o grupo.
- Um evento pode oferecer itens opcionais, como café da manhã. Não selecionar o item nunca impede a confirmação do evento.
- Preço de adicional é guardado em centavos. A seleção não comprova pagamento; cobrança, conciliação e reembolso continuam pertencendo ao contexto futuro de pagamentos.
- Quando houver PIX manual habilitado, a página apresenta os dados públicos do recebedor após uma confirmação que tenha adicional pago selecionado. Segredos de gateway nunca entram na resposta pública.
- Perfil, participantes e seleções pertencem à comunidade, usam RLS e não aceitam `tenant_id` fornecido pelo cliente.

## Modelos e recorrência

- Um evento pode ser salvo como modelo reutilizável contendo dados editoriais e o formulário, sem inscrições, auditoria ou identificadores públicos.
- Criar a partir de um modelo sempre gera um novo rascunho e exige informar uma nova data.
- Recorrência automática não é presumida: periodicidade, exceções e vínculo entre ocorrências permanecem decisões abertas.

## Segurança administrativa

- Tokens de acesso pertencem a uma sessão revogável; o banco persiste somente o identificador opaco da sessão, nunca o token.
- A sessão do navegador usa cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção; o JWT não é entregue ao JavaScript nem salvo em `localStorage`.
- Cada login gera uma prova aleatória independente. O navegador mantém essa prova somente em `sessionStorage` e a envia no cabeçalho `X-Session-Proof`; o banco guarda apenas seu hash com chave.
- Cookie e prova são validados juntos em toda rota autenticada, inclusive leituras. Roubar apenas um dos componentes não forma uma credencial reutilizável fora do navegador.
- A sessão também é vinculada a uma assinatura com chave do `User-Agent`. O IP não bloqueia a sessão, pois mudanças legítimas em redes móveis e proxies produziriam falsos positivos.
- Login sempre cria um novo identificador de sessão no servidor, prevenindo fixação. Logout limpa o cookie e revoga a sessão atual.
- Sessões criadas antes da adoção da prova dividida são revogadas pela migração e exigem novo login.
- A duração absoluta inicial permanece em oito horas. Renovação silenciosa, sessão persistente e fluxo “lembrar de mim” continuam fora do escopo até regras próprias.
- Todo usuário autenticado pode encerrar a sessão atual. Listar e encerrar outras sessões exige `sessions.manage`.
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
- A duração de oito horas será reduzida ou terá renovação com rotação de credenciais?
- Qual prazo de retenção, consentimento e opt-out vale para mensagens e contatos?
- Qual base legal, consentimento, prazo de retenção e processo de exclusão valem para nascimento, endereço e dados de filhos?
- O próprio membro poderá consultar e editar o perfil complementar?

## Acesso inicial

- O seed de desenvolvimento cria somente um usuário `admin`.
- A senha inicial deve ser alterada ou substituída por fluxo de convite antes de produção.
- Papéis `pastor` e `member` são modelos de sistema; novos usuários recebem um ou mais papéis pelo módulo de acesso.
- Migrações concedem capacidades novas ao papel administrativo de sistema para preservar a possibilidade de delegação; outros papéis não recebem ampliação automática fora do seed de desenvolvimento.

## Controle de funcionalidades

- Toda funcionalidade autenticada é associada a uma permissão granular no formato `context.action`.
- Papéis apenas agrupam permissões; regras de negócio não verificam nomes como `admin` ou `pastor`.
- Usuários com `roles.manage` podem liberar ou fechar funcionalidades alterando as permissões de um papel.
- A autorização do backend consulta as atribuições atuais; esconder menus ou botões no frontend não é uma fronteira de segurança.
- Chaves técnicas de permissão aparecem somente na administração de acessos. Nas demais telas, a interface descreve a capacidade em linguagem do negócio.
- Login local, consulta de evento publicado, cadastro pelo formulário público e health check são exceções públicas explícitas.
- Ainda precisa ser definida uma recuperação administrativa segura caso todos os papéis percam `roles.manage`.

## Auditoria e observabilidade

- Criações, edições e exclusões em tabelas críticas geram eventos de auditoria com tenant, ator, ação, tipo de recurso e horário.
- A auditoria não copia senhas, tokens, respostas de formulários nem valores alterados.
- Registros de auditoria são imutáveis para o papel runtime da aplicação.
- Listagens de auditoria usam cursor estável, com no máximo 100 registros por página; o padrão da interface é 25.
- Filtros de ação e evento são aplicados no banco antes da paginação, nunca somente sobre a página carregada.
- Logs operacionais e ferramentas como Sentry são observabilidade; não substituem a trilha persistente de auditoria.
- Cache não é usado para decisões de autorização. Alterações de permissão devem valer na próxima requisição ao backend.

## Imagens dos eventos

- Um evento pode receber várias imagens durante sua criação.
- O modo `hero` usa a primeira imagem como capa ampla; `carousel` apresenta todas as imagens em uma galeria navegável; `fixed` usa a primeira imagem como fundo fixo da página pública.
- Na página pública, a capa `hero` ocupa a primeira viewport e o formulário aparece sobreposto na lateral em telas amplas. Formulários longos rolam dentro do cartão; em telas menores, o cartão passa para baixo do resumo do evento.
- A interpretação dos modos é uma decisão inicial de apresentação e pode evoluir sem alterar a propriedade dos arquivos.
- O binário não fica no PostgreSQL. `event_media` guarda metadados e uma chave opaca do adaptador de armazenamento.
- Upload exige `events.update`, valida tipo e assinatura JPEG, PNG ou WebP e limita cada arquivo a 5 MiB por segurança operacional.
- Uma mídia só pode ser lida publicamente quando pertence a um evento publicado.
- Ainda precisa ser definido pelo produto se haverá imagem destacada manual, reordenação e exclusão de mídias na primeira versão.
