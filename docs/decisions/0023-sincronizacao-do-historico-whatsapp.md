# 0023 — Sincronização do histórico do WhatsApp

Status: aceita

## Contexto

O conector via QR recebia apenas mensagens novas. Diferentemente do WhatsApp Web, ele não solicitava ao celular a lista inicial de conversas nem o histórico disponível e não havia uma ação incremental ao abrir uma conversa.

O histórico pode ser grande, conter dados pessoais e chegar em vários blocos. A comunidade também pode possuir vários pastores, cada um com seu próprio canal.

## Decisão

- O adapter solicita a sincronização completa oferecida pelo Baileys ao conectar um canal e se identifica como cliente de desktop.
- Somente conversas individuais são importadas. Grupos, status e newsletters ficam fora do MVP.
- A lista inicial cria conversas para os chats individuais mesmo quando o bloco recebido ainda não contém uma mensagem compatível.
- Mensagens históricas recebidas e enviadas pelo celular usam o mesmo fluxo de ingestão, mídia privada e identificador idempotente das mensagens em tempo real.
- O volume inicial é limitado por instalação com `WHATSAPP_HISTORY_CHAT_LIMIT` e `WHATSAPP_HISTORY_MESSAGE_LIMIT`. Os padrões são 50 conversas e 50 mensagens por conversa.
- Ao abrir uma conversa, a API valida `conversations.read` e o acesso do usuário, então enfileira uma solicitação incremental. O worker usa a mensagem mais antiga conhecida como cursor; nenhum identificador de tenant ou canal é aceito do navegador.
- O pastor vê somente conversas do próprio canal, salvo quando possui a permissão granular de supervisão já existente.
- A disponibilidade do histórico e de mídias antigas depende do que o WhatsApp entregar ao dispositivo vinculado. Falhas de mídia não impedem a importação do texto ou da legenda.

## Consequências

- A primeira sincronização pode levar alguns minutos e atualizar a tela em blocos pelo fluxo em tempo real.
- Reinícios não duplicam mensagens porque `provider_message_id` é único dentro da conversa.
- Os limites protegem memória, armazenamento e banco em instalações pequenas e podem ser elevados conscientemente pelo mantenedor.
- Esta capacidade permanece atrás da porta `ConversationProvider`; outro adapter pode implementar a mesma intenção sem expor Baileys ao domínio ou à aplicação.

## Fora de escopo

- Espelhar grupos, status, chamadas, reações e todas as alterações do WhatsApp.
- Garantir que o provedor retenha indefinidamente arquivos antigos.
- Envio em massa.
