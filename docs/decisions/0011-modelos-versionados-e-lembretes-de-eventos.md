# 0011 — Modelos versionados e lembretes de eventos

Status: aceita

## Contexto

Pastores precisam alterar mensagens reutilizáveis em um lugar previsível e habilitar seu uso em cada evento. Templates oficiais da Meta, modelos completos de evento e textos editoriais de lembrete possuem ciclos de vida diferentes e não podem compartilhar a mesma entidade.

## Decisão

- A Central de comunicação administra `communication_templates` e suas versões imutáveis.
- Editar cria uma versão; não reescreve o conteúdo que uma regra existente já selecionou.
- `event_reminder_rules` vincula evento, versão, canal, público e antecedência.
- A regra só pode nascer com modelo ativo e canal acessível ao usuário.
- Modelo ativo e regra ativa são barreiras independentes.
- Templates oficiais sincronizados da Meta permanecem um catálogo separado até a modelagem WABA/números e a submissão oficial serem implementadas.
- Esta etapa configura o fluxo e produz intenção auditável; não declara entrega operacional sem scheduler, fila e adapter de canal.

## Alternativas consideradas

- Guardar o texto diretamente no evento: descartado por duplicar conteúdo e impedir governança central.
- Fazer edições globais alterarem todos os eventos: descartado por produzir mudanças silenciosas em comunicações planejadas.
- Usar diretamente a projeção da Meta: descartado porque WhatsApp Web/manual, e-mail e rascunhos locais não possuem o mesmo ciclo de aprovação.

## Consequências

- O histórico mostra exatamente qual versão cada evento escolheu.
- Atualizar um lembrete exige ação explícita no evento.
- Três novas tabelas tenant-direct recebem RLS forçada, chaves compostas, auditoria e testes cruzados.
- A futura entrega pode consumir regras ativas sem alterar o domínio editorial.
