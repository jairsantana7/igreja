# 0022 — Restauração de canais no worker

Status: aceita

## Contexto

O estado criptografado do Baileys sobrevive ao reinício, mas as conexões ativas vivem somente na memória do worker. Após reiniciar o processo, o banco ainda informava `connected` enquanto nenhum socket era restaurado. Mensagens novas não eram ingeridas e, por consequência, não existia alteração para publicar no fluxo em tempo real.

Uma busca global direta em `conversation_channels` quebraria o isolamento RLS do papel de runtime. Ao mesmo tempo, um job de recuperação precisa descobrir quais tenants possuem sessões que devem ser retomadas.

## Decisão

- Ao iniciar, o worker restaura canais `whatsapp_web` nos estados `connecting`, `awaiting_qr`, `connected` ou `failed` que possuam credenciais Baileys persistidas.
- A descoberta usa a função estreita `app.list_restorable_conversation_channels()`, com `SECURITY DEFINER`, `search_path` fixo e retorno limitado a `tenant_id` e `channel_id`.
- O runtime não recebe `SELECT` global nas tabelas e continua `NOSUPERUSER`, `NOBYPASSRLS` e sem propriedade de schema ou tabela.
- Após a descoberta, cada canal é novamente consultado e conectado dentro de uma transação com `set_config('app.tenant_id', tenantId, true)`.
- Canais `configured`, `disconnected` ou `disconnecting` nunca são restaurados automaticamente.
- Falhas são registradas apenas com identificadores internos e código operacional, sem credenciais, telefone ou conteúdo de conversa. Uma falha não impede a recuperação dos outros canais.

## Alternativas consideradas

- Conceder leitura global de canais ao runtime: descartado por ampliar desnecessariamente o acesso multitenant.
- Manter o estado `connected` e aguardar uma mensagem de saída: descartado porque mensagens recebidas continuariam invisíveis.
- Exigir intervenção manual após todo deploy: descartado por produzir indisponibilidade silenciosa.
- Criar um worker por tenant: possível em escala maior, mas complexo demais para o MVP.

## Consequências

- Deploys e reinícios retomam a recepção sem novo QR enquanto a credencial continuar válida.
- A função privilegiada passa a fazer parte da superfície de segurança e possui teste específico de retorno mínimo.
- Sessões revogadas pelo WhatsApp continuam seguindo o fluxo existente de `logged_out` e não são restauradas.
