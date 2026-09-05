# Integrações

Este projeto separa configuração, regra de negócio e comunicação com fornecedores. A tela administrativa registra a intenção da comunidade; um recurso só está operacional quando a implantação registra um adaptador correspondente.

## Contratos

- Login social implementa `ExternalIdentityProvider` em `application/ports/authentication.port.ts`.
- MFA implementa `MultiFactorProvider`; o projeto não escolhe TOTP, passkey ou fornecedor pelo domínio.
- Cobranças implementam `PaymentGateway` em `application/ports/payment-gateway.port.ts`.
- Configurações dependem de `CommunitySettingsRepository`; o adaptador PostgreSQL não vaza para os casos de uso.
- Cache implementa `CacheStore`; a implementação padrão é no-op e pode ser substituída por Redis ou outro backend.
- Filas implementam `JobQueue`; a implementação padrão falha explicitamente até BullMQ, RabbitMQ, SQS ou outro broker ser configurado.
- Mensageria individual implementa `ConversationProvider`; a porta não conhece Meta, WhatsApp Cloud API ou outro fornecedor.
- Consulta de templates implementa `WhatsAppTemplateProvider`; `MetaWhatsAppTemplateProvider` usa o endpoint oficial `/{WABA-ID}/message_templates`.
- Segredos são resolvidos por `SecretResolver`; a implementação local lê somente a variável nomeada em `secret_reference`.
- Logs e captura de exceções implementam `ApplicationLogger`; Sentry e OpenTelemetry entram como adaptadores de infraestrutura.
- Arquivos implementam `MediaStorage`; disco local, S3 e Cloudflare R2 são adaptadores de infraestrutura.
- A seleção ocorre por `providerKey`, nunca por condicionais de fornecedor no domínio.

## Adicionando um adaptador

1. Implemente a porta dentro de `infrastructure` em um diretório próprio do fornecedor.
2. Registre a implementação somente no composition root (`app.module.ts`).
3. Leia credenciais pelo nome salvo em `secret_reference`, usando o ambiente ou secret manager da instalação.
4. Valide que o adaptador existe antes de expor login ou cobrança como operacional.
5. Adicione testes de contrato que possam ser reutilizados por outros adaptadores.
6. Documente variáveis, URLs de callback/webhook, permissões externas e procedimento de rotação.

## Cache e filas

- Chaves de cache sempre incluem o tenant e possuem TTL explícito.
- Decisões de autorização não usam cache; fechar uma permissão deve valer na próxima requisição.
- Jobs carregam um `tenantId` confiável e o worker abre seu próprio contexto RLS por tarefa.
- Payloads não carregam senhas, tokens ou dados pessoais desnecessários.
- Consumidores são idempotentes e definem política explícita de tentativas, atraso e dead-letter queue.
- O adaptador não pode confirmar a mensagem antes da conclusão segura do trabalho.
- Campanhas de evento são persistidas antes do enqueue e usam `events.communication.dispatch` com chave de deduplicação.
- Respostas da central são persistidas antes do enqueue e usam `conversations.message.dispatch`; o identificador da mensagem é a chave de deduplicação.

## Canais de conversa

- Cada canal pertence a um usuário e a uma comunidade. O worker sempre reabre o contexto RLS com o `tenantId` confiável do job.
- O banco armazena número, identificador operacional e referência do segredo; tokens permanecem no secret manager.
- O webhook deve validar assinatura e replay antes de resolver canal e contato. Cabeçalhos públicos não definem tenant.
- Atualizações de entrega são idempotentes pelo identificador do fornecedor e não podem mover mensagens de outro tenant.
- Conteúdo, nomes e números são dados pessoais: não os inclua em logs, breadcrumbs ou payloads de erro.
- Um canal somente recebe estado `connected` após teste real do adapter. Salvar configuração resulta apenas em `configured`.

## Meta WhatsApp Cloud API

- Defina `META_GRAPH_API_VERSION` com uma versão vigente da Graph API; o projeto não fixa silenciosamente uma versão que possa expirar.
- Em cada canal `whatsapp_cloud`, `provider_account_id` contém o WABA ID e `secret_reference` contém somente o nome da variável que guarda o access token.
- A sincronização consulta todas as páginas de `/{WABA-ID}/message_templates`, mantém a Meta como fonte oficial e desativa localmente itens que deixaram de ser retornados.
- Tokens nunca são persistidos, enviados ao navegador ou incluídos em erros. O host do adapter é fixo em `graph.facebook.com` para não transformar paginação externa em SSRF.
- O endpoint oficial e as operações suportadas estão na [coleção mantida pela Meta](https://www.postman.com/meta/whatsapp-business-platform/folder/lczy75a/templates).
- Embedded Signup, troca segura de código, assinatura de webhook, idempotência de mensagens e envio por template ainda não estão implementados.

## Logs e captura de erros

- `ApplicationLogger` recebe eventos estáveis e contexto estruturado.
- A implementação padrão não imprime mensagens internas, SQL, payloads ou stack traces potencialmente sensíveis.
- Um adaptador Sentry deve configurar scrubbing antes do envio, separar ambientes e nunca usar auditoria como breadcrumb integral.

## Segurança de identidade

- Gere e valide `state`; use PKCE quando suportado.
- Mantenha allowlist exata de URLs de retorno.
- Valide issuer, audience, assinatura, expiração e e-mail verificado no backend.
- Não vincule contas existentes apenas pela coincidência de e-mail até a regra de negócio ser decidida.
- Nunca envie tokens do provedor para logs ou para o frontend além do estritamente necessário ao protocolo.

## Segurança de pagamentos

- Represente valores em centavos inteiros, nunca em ponto flutuante.
- Verifique a assinatura do webhook sobre o corpo original e implemente idempotência.
- Consulte o provedor no backend antes de confirmar estados críticos quando o protocolo exigir.
- Não use o gateway como fonte única para autorização de acesso a dados de outro tenant.
- Tokens, chaves privadas e payloads pessoais não entram em logs.
- Teste timeout, repetição, entrega fora de ordem, estorno e falha parcial antes de produção.

## Estado atual

Google, Microsoft, PIX manual, um slot genérico de gateway e canais individuais de conversa podem ser configurados. Sessões locais já são revogáveis. A consulta oficial de templates da Meta está implementada, mas não há adaptador de envio/recebimento, Embedded Signup, webhook, fila compartilhada, identidade externa, MFA ou pagamento instalado. Portanto conversas externas e cobranças permanecem **não operacionais** até essas implementações.
