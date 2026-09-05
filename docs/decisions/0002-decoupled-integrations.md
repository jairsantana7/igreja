# ADR 0002: integrações desacopladas e segredos externos

## Status

Aceito para a fundação do MVP. Adaptadores reais continuam pendentes.

## Contexto

Cada instalação pode escolher provedores de identidade, PIX manual e gateways diferentes. Acoplar casos de uso a fornecedores específicos dificultaria a manutenção open source, os testes e a substituição de serviços.

## Decisão

- Casos de uso dependem de portas (`CommunitySettingsRepository`, `ExternalIdentityProvider` e `PaymentGateway`).
- A infraestrutura implementa essas portas e registra adaptadores por uma `providerKey` estável.
- `community_integrations` guarda somente estado habilitado, configuração pública e referência externa de segredo.
- Client secrets, access tokens e chaves privadas permanecem em variáveis de ambiente ou secret manager da implantação.
- A interface pode registrar intenção de configuração, mas somente mostra um recurso como operacional quando houver adaptador instalado.
- Configuração é protegida por `settings.read` e `settings.manage`, além de RLS por comunidade.

## Consequências

- Novos fornecedores não alteram o domínio nem os controllers.
- Cada adaptador precisa de testes de contrato, tratamento idempotente de webhook e documentação própria.
- A instalação exige coordenação entre configuração do banco e secrets externos.
- Nenhum pagamento ou login social real deve ser anunciado apenas porque a configuração foi salva.
