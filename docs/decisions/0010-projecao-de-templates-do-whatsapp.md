# 0010 — Projeção local de templates oficiais do WhatsApp

Status: aceita

## Contexto

Cada pastor pode conectar seu próprio canal. Para iniciar conversas fora da janela permitida pelo WhatsApp, o produto precisará trabalhar com templates oficiais, cujo conteúdo e estado de aprovação pertencem à Meta. Modelos de evento já existentes têm finalidade diferente.

## Decisão

- `WhatsAppTemplateProvider` será a porta de consulta externa; o primeiro adapter usa a Meta Graph API.
- `whatsapp_message_templates` será uma projeção local por tenant e canal, protegida por RLS e FK composta.
- A Meta permanecerá como fonte oficial de nome, idioma, categoria, componentes e status.
- A sincronização percorrerá a paginação oficial, fará upsert somente quando houver mudança e marcará como inativos templates ausentes na resposta completa.
- Tokens serão resolvidos por `SecretResolver` a partir da referência do canal e nunca persistidos no PostgreSQL.
- Leitura e sincronização terão as permissões separadas `whatsapp.templates_read` e `whatsapp.templates_sync`.
- O dono acessa templates do próprio canal; `channels.manage_all` amplia explicitamente o alcance dentro do tenant.

## Alternativas consideradas

- Consultar a Meta toda vez que a tela abrir: rejeitada por disponibilidade, latência e limites externos.
- Permitir aprovação manual local: rejeitada porque criaria um estado falso divergente da fonte oficial.
- Reutilizar `event_templates`: rejeitada porque mistura modelos editoriais de evento com contratos de mensageria aprovados externamente.
- Implementar criação de templates no mesmo passo: adiada até aprovação das regras de categoria, exemplos, variáveis, consentimento e custo.

## Consequências

O sistema passa a listar templates e seus status reais quando a instalação configura WABA ID, token e versão da Graph API. Isso não habilita sozinho o envio, o webhook ou o Embedded Signup; essas capacidades continuam exigindo portas, regras e testes próprios.
