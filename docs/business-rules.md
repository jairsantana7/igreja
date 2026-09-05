# Regras de negócio

Este documento registra o entendimento atual e deve evoluir antes do código quando surgirem decisões novas.

## Atores

- **Admin:** usuário inicial da comunidade, com permissão para configurar papéis e criar os demais usuários.
- **Pastor:** papel inicial que recebe permissões para administrar eventos da própria comunidade.
- **Membro:** entra ou cria uma conta vinculada à comunidade e confirma inscrição em um evento publicado.

## Eventos

- O pastor cria título, descrição, local, início, limite de inscrição, capacidade opcional e formulário.
- O formulário aceita inicialmente texto curto, texto longo, seleção única e caixa de confirmação.
- Um evento pode estar em `draft`, `published` ou `cancelled`.
- Somente `published` é acessível pelo link público.

## Inscrição

- O membro precisa de uma identidade autenticada antes de confirmar.
- Se ainda não tiver conta naquela comunidade, pode registrar nome, e-mail e senha no fluxo do evento.
- A combinação membro/evento é única. Repetir a confirmação devolve a inscrição existente sem duplicar.
- O backend valida campos obrigatórios e opções permitidas.
- Capacidade esgotada, lista de espera e cancelamento ainda precisam de definição detalhada.

## Login social

- Provedores sociais são opcionais e configuráveis por implantação.
- A aplicação só confia em e-mail/subject após validação OIDC no backend.
- A vinculação automática por e-mail e regras para contas já existentes ainda precisam de decisão; até lá, nenhum adaptador social é habilitado por padrão.

## Questões abertas

- Um membro pode participar de várias comunidades com uma única conta global?
- Eventos podem aceitar inscrição sem senha (magic link)?
- Quem pode editar/publicar além do pastor?
- Quais regras valem para capacidade, convidados, pagamentos e cancelamento?
- Quais dados e consentimentos LGPD são obrigatórios por formulário?

## Acesso inicial

- O seed de desenvolvimento cria somente um usuário `admin`.
- A senha inicial deve ser alterada ou substituída por fluxo de convite antes de produção.
- Papéis `pastor` e `member` são modelos de sistema; novos usuários recebem um ou mais papéis pelo módulo de acesso.
