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
- Um evento pode estar em `draft`, `published` ou `cancelled`.
- Somente `published` é acessível pelo link público.
- No MVP, um evento está aberto para inscrições quando está publicado, ainda não começou e seu prazo de inscrição não venceu.

## Inscrição

- O membro precisa de uma identidade autenticada antes de confirmar.
- Se ainda não tiver conta naquela comunidade, pode registrar nome, e-mail e senha no fluxo do evento.
- A combinação membro/evento é única. Repetir a confirmação devolve a inscrição existente sem duplicar.
- O backend valida campos obrigatórios e opções permitidas.
- Capacidade esgotada, lista de espera e cancelamento ainda precisam de definição detalhada.
- A contagem exibida na gestão representa inscrições confirmadas, não presença física no evento.

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
- Como registrar presença real: check-in manual, código individual, QR Code ou outra forma?
- Como eventos definem preço, gratuidade, lotes e política de reembolso?
- Quais gateways e provedores OIDC serão mantidos oficialmente pelo projeto?

## Acesso inicial

- O seed de desenvolvimento cria somente um usuário `admin`.
- A senha inicial deve ser alterada ou substituída por fluxo de convite antes de produção.
- Papéis `pastor` e `member` são modelos de sistema; novos usuários recebem um ou mais papéis pelo módulo de acesso.
