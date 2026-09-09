# 0020 — Envio de mídia pela Central de conversas

Status: aceita

## Contexto

A decisão 0019 permitiu receber e consultar imagens e áudios privados, mas adiou o envio desses arquivos pelo compositor. Isso deixa o atendimento incompleto: o pastor vê a mídia recebida, porém precisa voltar ao celular para responder com outra mídia.

## Decisão

- Quem possui `conversations.reply` e acesso à conversa pode enviar um anexo por mensagem pela Central.
- O primeiro recorte aceita imagens JPEG, PNG ou WebP de até 10 MiB e áudios OGG/Opus, MP3, M4A ou AAC de até 20 MiB.
- Imagens podem receber uma legenda de até 4.000 caracteres. Áudios são enviados sem texto adicional e aparecem no histórico com o texto acessível “Áudio”.
- A camada de aplicação valida MIME, assinatura, tamanho e conteúdo vazio antes de persistir. O nome original do arquivo não é armazenado.
- O arquivo é salvo pela porta `MediaStorage`; mensagem e metadados são persistidos sob RLS na mesma transação de tenant antes de o job ser enfileirado.
- Falha de persistência remove o arquivo recém-salvo. Falha da fila preserva mensagem e arquivo como pendentes para recuperação operacional.
- O job continua usando `conversations.message.dispatch` e o identificador da mensagem como chave idempotente. O contrato do provedor recebe mídia de forma neutra, sem acoplar o caso de uso ao Baileys.
- O espelho `fromMe` do WhatsApp associa o identificador do provedor à mensagem pendente e descarta a cópia temporária baixada, evitando mensagem e arquivo duplicados.
- Conteúdo, chave de armazenamento, nome original e legenda não entram em logs nem no payload da auditoria.

Esta decisão substitui somente o adiamento do “envio de anexos pelo composer” registrado na decisão 0019.

## Alternativas consideradas

- Enviar diretamente pelo controller: descartado porque ignoraria persistência anterior ao enqueue e acoplaria HTTP ao provedor.
- Enviar imagem por URL pública: descartado porque quebraria a autorização privada da conversa.
- Aceitar vários anexos no mesmo envio: adiado para manter falha, retry e idempotência explícitos no MVP.
- Mandar legenda como uma segunda mensagem para áudio: descartado neste recorte porque criaria dois efeitos externos para uma única chave de idempotência.

## Consequências

- O pastor pode concluir o atendimento com texto, imagem ou áudio sem voltar ao celular.
- Outros adapters implementam o mesmo contrato de entrega e podem decidir como traduzir imagem e áudio para o provedor.
- Antivírus, gravação de áudio no navegador, múltiplos anexos, documentos e vídeo permanecem fora do MVP.
