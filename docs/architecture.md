# Arquitetura

## Visão

```text
Navegador -> Cloudflare -> Traefik -> Nuxt / NestJS
                                      |
                              portas da aplicação
                                      |
                        adaptadores PostgreSQL/JWT
                                      |
                         PostgreSQL com RLS forçada
```

O backend segue arquitetura limpa. O sentido permitido das dependências é:

```text
presentation -> application -> domain
infrastructure -> application -> domain
app.module.ts -> todas as camadas (composition root)
```

## Camadas

- `domain`: modelos e invariantes independentes de framework.
- `application`: casos de uso e contratos necessários para executá-los.
- `infrastructure`: PostgreSQL, hash de senha e JWT.
- `presentation`: controllers, DTOs, guards e erros HTTP.

O Nuxt é um cliente da API. O frontend não é uma fronteira de autorização; permissões e tenant são impostos novamente no backend e no PostgreSQL.

## Contexto de tenant

O login exige o slug da comunidade e resolve somente a identidade necessária por uma função estreita. Após validar a senha, o JWT assinado carrega `tenantId` e `userId`. O guard valida assinatura, emissor e audiência. O repositório abre uma transação e executa `set_config('app.tenant_id', tenantId, true)` antes de qualquer SQL protegido.

O valor é local à transação, portanto não permanece na conexão devolvida ao pool.

## Sessão do navegador

O JWT assinado é transportado em cookie `HttpOnly`; o cliente não recebe seu valor. Uma prova aleatória separada fica apenas na aba e seu HMAC, junto ao HMAC do `User-Agent`, é armazenado em `auth_sessions`. O guard exige os três componentes — JWT válido, sessão ativa e prova/assinatura correspondentes — antes de instalar o principal autenticado. O cabeçalho customizado também impede requests autenticados por CSRF tradicional.

## Bounded context: Eventos e inscrições

O agregado `Event` pertence a uma comunidade, é criado por uma identidade autorizada e possui campos de formulário ordenados. Um evento começa como rascunho e pode ser publicado. O registro relaciona um membro ao evento e guarda respostas tipadas pelo identificador do campo.

Invariantes iniciais:

- `events.create` cria eventos e `events.publish` publica;
- slug público é único dentro da comunidade e o identificador público é globalmente opaco;
- data limite não pode ser posterior ao início;
- campo de seleção exige opções;
- um membro tem no máximo uma inscrição ativa por evento;
- respostas só podem apontar para campos do mesmo evento e tenant;
- evento não publicado não aparece no resolver público.

A central operacional do evento reúne visão geral, inscrições, formulário, comunicação, check-in e auditoria sem deslocar regras para o controller. Presença, versões de formulário, campanhas e modelos possuem portas próprias na aplicação e adaptadores PostgreSQL independentes. O detalhe do evento apenas compõe essas capacidades no cliente Nuxt.

Autenticação social entra pela porta `ExternalIdentityProvider`. Um adaptador futuro troca o código do provedor por uma identidade verificada e a vincula a `external_accounts`; o domínio não conhece detalhes OAuth/OIDC.

## Bounded context: Configurações da comunidade

Configurações de login social e pagamentos formam um contexto separado de eventos. Os casos de uso dependem de `CommunitySettingsRepository`; PostgreSQL é apenas um adaptador. Provedores externos implementam `ExternalIdentityProvider` ou `PaymentGateway` e são selecionados por uma `providerKey`, mantendo os princípios de responsabilidade única, inversão de dependência e aberto/fechado.

`community_integrations` armazena configuração pública por tenant. Campos privados são referências a secrets externos, nunca o valor da credencial. Salvar a configuração não torna uma integração operacional: a implantação também precisa registrar o adaptador correspondente.

## Bounded context: Membros

A identidade básica em `users` continua suficiente para autenticação e inscrição. `member_profiles` e `member_children` formam um perfil complementar opcional, acessado por casos de uso e portas próprios. Essa separação permite aplicar permissões mais restritas à data de nascimento, ao endereço e aos dados de menores sem ampliar implicitamente `users.read`.

O cadastro administrativo usa `MemberOnboardingRepository` como porta específica para persistir identidade, papéis e o perfil opcional em uma única transação. O caso de uso exige `users.create` e acrescenta `members.profile_manage` quando recebe dados complementares.

O banco impõe tenant consistente nas relações com FKs compostas e RLS forçada. A API devolve esses dados somente no endpoint de detalhe com `members.profile_read`; auditoria registra a operação, mas não replica valores pessoais.

## Paginação da auditoria

A trilha usa paginação keyset pela ordenação imutável `(created_at DESC, id DESC)`. O cursor opaco transporta somente essa posição, é validado no caso de uso e resulta em comparação indexada dentro da mesma transação com contexto RLS. Filtros de ação e evento são executados antes do cursor. O cliente guarda o histórico de cursores apenas para permitir voltar às páginas já visitadas.

## Contextos preparados

- **Comunicação:** campanhas persistem como intenção de envio; a entrega passa por `JobQueue` e por adaptadores de canal.
- **Conversas:** canais, atendimentos e mensagens formam um bounded context próprio. `ConversationProvider` recebe/envia mensagens e `JobQueue` desacopla a entrega; eventos apenas fornecem um vínculo opcional.
- **Templates do WhatsApp:** `WhatsAppTemplateProvider` consulta o fornecedor e `WhatsAppTemplateRepository` mantém uma projeção por canal. Casos de uso conhecem status e componentes, mas não conhecem URLs, tokens ou detalhes da Graph API.
- **Pagamentos:** permanece separado de inscrição. `PaymentGateway` evita dependência de fornecedor e nenhuma cobrança é criada sem regras de preço, conciliação e reembolso.
- **Segurança administrativa:** sessões revogáveis e uma futura porta de MFA não alteram o domínio de eventos. Acesso emergencial será um fluxo privilegiado explícito, nunca um tenant vazio.
- **Modelos de evento:** reutilizam conteúdo e formulário, mas não transformam recorrência em comportamento implícito.

Esses limites evitam que a plataforma cresça como um ERP genérico: o núcleo continua sendo operação de eventos da comunidade.

## Portas transversais

`ApplicationLogger`, `CacheStore`, `JobQueue` e `MediaStorage` pertencem à camada de aplicação e não conhecem Sentry, Redis, BullMQ, RabbitMQ, disco local, S3 ou R2. A infraestrutura fornece adaptadores substituíveis e `app.module.ts` faz a composição. A implementação padrão de cache é no-op; a de fila falha explicitamente para impedir perda silenciosa de trabalho. O armazenamento local de mídia serve somente ao desenvolvimento e deve ser substituído por armazenamento de objetos em produção.

## Autorização granular

Permissões são chaves globais e imutáveis. Cada comunidade define papéis que agrupam essas chaves, e um usuário pode receber vários papéis. O token identifica usuário e tenant, mas o `PermissionsGuard` recarrega papéis e permissões atuais a cada requisição protegida. A camada HTTP bloqueia cedo, e casos de uso mantêm as invariantes de autorização relevantes.
