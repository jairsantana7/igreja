# 0024 — Ações em mensagens

Status: aceita

## Contexto

A Central exibia mensagens, mídias e estados, mas não oferecia as interações esperadas em uma conversa: citar uma mensagem e reagir com emoji. Acoplar essas ações diretamente ao Baileys impediria adapters futuros e persistir somente no navegador perderia o contexto compartilhado entre pastores autorizados.

## Decisão

- O conjunto do MVP inclui responder citando, reagir, remover a própria reação do canal, copiar texto e baixar uma mídia já autorizada.
- Responder e reagir exigem `conversations.reply` tanto no controller quanto no caso de uso. Ler citações e reações exige `conversations.read` e o escopo já aplicado à conversa.
- Uma resposta citada referencia uma mensagem da mesma conversa e do mesmo tenant por chave estrangeira composta.
- Reações são persistidas em `conversation_message_reactions`, separando o ator `channel` do ator `contact`. Em uma conversa individual existe no máximo uma reação atual de cada lado por mensagem.
- A aplicação usa emojis rápidos: `👍`, `❤️`, `😂`, `😮`, `😢` e `🙏`. Enviar a mesma reação novamente remove a reação do canal.
- O caso de uso valida e enfileira a intenção. O worker traduz a citação ou reação pela porta `ConversationProvider`; somente após sucesso no provedor confirma a reação local.
- Reações realizadas pelo celular ou pelo contato entram pelo evento do adapter e atualizam a mesma representação idempotente.
- Copiar texto ocorre somente no navegador. Download reutiliza o endpoint privado de mídia e sua autorização, sem expor `storage_key`.

## Decisões pendentes

- Editar mensagem enviada: definir prazo, quais tipos são editáveis e como preservar o conteúdo anterior na auditoria sem copiar conteúdo pessoal para o log.
- Excluir para todos ou somente localmente: definir prazo, autoria, tombstone e comportamento quando o provedor recusar.
- Encaminhar: definir seleção de destino, consentimento e sinalização de conteúdo encaminhado.
- Favoritar ou fixar: definir se é preferência individual do pastor, estado compartilhado da comunidade ou ação visível no WhatsApp.

## Consequências

- O banco guarda referências e reações, mas o conteúdo continua sujeito ao acesso da conversa e ao RLS.
- Adapters sem suporte retornam conflito explícito; a interface não declara a ação como entregue antes do worker.
- A auditoria registra mudanças na tabela de reações sem registrar o texto da mensagem.
