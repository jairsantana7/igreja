# Integrações

Este projeto separa configuração, regra de negócio e comunicação com fornecedores. A tela administrativa registra a intenção da comunidade; um recurso só está operacional quando a implantação registra um adaptador correspondente.

## Contratos

- Login social implementa `ExternalIdentityProvider` em `application/ports/authentication.port.ts`.
- MFA implementa `MultiFactorProvider`; o projeto não escolhe TOTP, passkey ou fornecedor pelo domínio.
- Cobranças implementam `PaymentGateway` em `application/ports/payment-gateway.port.ts`.
- Configurações dependem de `CommunitySettingsRepository`; o adaptador PostgreSQL não vaza para os casos de uso.
- Cache implementa `CacheStore`; a implementação padrão é no-op e pode ser substituída por Redis ou outro backend.
- Filas implementam `JobQueue`; a implementação padrão falha explicitamente até BullMQ, RabbitMQ, SQS ou outro broker ser configurado.
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

Google, Microsoft, PIX manual e um slot genérico de gateway podem ser configurados. Sessões locais já são revogáveis. Ainda não há adaptador externo de identidade, MFA, fila ou pagamento instalado, cobrança de evento, webhook ou vinculação de conta social; portanto esses recursos permanecem **não operacionais** até uma implementação posterior.
