# 0019 — Mídia privada nas conversas

Status: aceita

## Contexto

Conversas pastorais usam com frequência fotografias e mensagens de voz. O conector atual preserva somente texto e legendas, portanto uma mídia sem legenda desaparece do histórico do sistema.

Esses arquivos podem conter dados pessoais ou pastorais sensíveis. Uma URL pública ou o armazenamento do binário no PostgreSQL comprometeriam isolamento, custo e evolução dos adapters.

## Decisão

- O primeiro suporte de mídia recebe imagens JPEG, PNG e WebP de até 10 MiB e áudios OGG/Opus, MP3, M4A ou AAC de até 20 MiB.
- O adapter do provedor baixa o conteúdo com limite de bytes, valida MIME e assinatura e o entrega à porta `MediaStorage`.
- O banco guarda somente metadados em `conversation_message_attachments`, classificada como `tenant-direct`, com RLS forçada e FK composta para mensagem, conversa e tenant.
- Uma mídia pertence a exatamente uma mensagem. O identificador do provedor mantém a ingestão idempotente; arquivos salvos que não forem associados são removidos pelo worker.
- A mídia recebida e a enviada diretamente pelo celular conectado entram no histórico. Sem legenda, a mensagem recebe o texto acessível “Imagem” ou “Áudio”.
- Ler o binário exige sessão válida, `conversations.read` e acesso à conversa. A API usa resposta privada sem cache; a interface cria uma URL `blob:` somente durante a sessão da página.
- A auditoria registra a alteração pelo identificador do anexo, sem copiar conteúdo, chave de armazenamento, nome de contato ou legenda.
- O filesystem local continua sendo apenas um adapter de desenvolvimento. Implantações com API e worker separados devem compartilhar o volume ou registrar um adapter de object storage privado.
- Enviar anexos a partir do composer, transcrever áudio, antivírus, retenção e exclusão programada permanecem decisões posteriores.

## Alternativas consideradas

- Expor arquivos por URL pública: descartado por permitir acesso fora da autorização da conversa.
- Guardar binários no PostgreSQL: descartado para manter banco, backup e replicação independentes do volume de mídia.
- Aceitar qualquer MIME informado pelo provedor: descartado porque metadados externos não são uma fronteira de confiança.

## Consequências

- Fotos e áudios passam a ser úteis no atendimento sem reduzir a proteção de sessão já adotada.
- O worker e a API precisam acessar o mesmo adapter de armazenamento.
- Falha de download não elimina a mensagem: o histórico textual permanece e a falha operacional é registrada sem dados pessoais.
