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

Autenticação social entra pela porta `ExternalIdentityProvider`. Um adaptador futuro troca o código do provedor por uma identidade verificada e a vincula a `external_accounts`; o domínio não conhece detalhes OAuth/OIDC.

## Autorização granular

Permissões são chaves globais e imutáveis. Cada comunidade define papéis que agrupam essas chaves, e um usuário pode receber vários papéis. O token carrega um snapshot de papéis e permissões de curta duração; mudanças críticas podem exigir revogação/renovação do token. A camada HTTP bloqueia cedo com `PermissionsGuard`, e casos de uso mantêm as invariantes de autorização relevantes.
