# 0033 — Portal de eventos do membro separado da gestão

Status: aceita

## Contexto

O membro autenticado precisa descobrir eventos disponíveis e reencontrar as próprias confirmações. A navegação anterior apontava qualquer identidade para o dashboard administrativo e exibia criação de evento, embora a API recusasse essas operações pela ausência de permissão.

## Decisão

Criar a área **Meus eventos** e a projeção autenticada `GET /member/events`. O endpoint recebe somente o principal da sessão, aplica `events.member_portal_read` no guard e no caso de uso, entra no tenant via RLS e restringe o histórico ao `user_id` autenticado.

Eventos disponíveis são publicados, futuros, dentro do prazo e sem confirmação ativa desse usuário. O histórico preserva as confirmações do próprio usuário em qualquer estado posterior do evento. O frontend escolhe o destino inicial pelas capacidades efetivas: gestão para `events.read`, portal para `events.member_portal_read`.

O papel de sistema `member` recebe essa permissão na migration de adoção porque ela representa a finalidade básica do papel. O administrador continua podendo retirar ou delegar a capacidade pela gestão de papéis.

## Alternativas consideradas

- Reutilizar `GET /events`: rejeitado porque seu contrato, escopo e dados são administrativos.
- Apenas esconder os menus: rejeitado porque apresentação não é uma fronteira de autorização.
- Expor um identificador de membro no endpoint: rejeitado porque ampliaria o risco de consulta horizontal sem necessidade para a experiência própria.

## Consequências

- Membros não veem dashboard, lista administrativa nem criação de eventos na navegação padrão.
- A leitura usa uma porta própria e mantém o caso de uso independente de NestJS e PostgreSQL.
- Editar ou cancelar uma inscrição continua fora do MVP e exigirá decisão e autorização próprias.
- A migration não cria tabelas; reutiliza estruturas já classificadas e protegidas por RLS.
