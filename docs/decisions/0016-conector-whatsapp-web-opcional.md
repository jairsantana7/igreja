# 0016 — Conector opcional de WhatsApp Web

Status: aceita

## Contexto

Muitos pastores já usam um número pessoal no WhatsApp e precisam testar conversas individuais sem contratar imediatamente a plataforma oficial da Meta. O projeto é open source e não pode acoplar o domínio a uma biblioteca não oficial nem fazer a indisponibilidade desse conector derrubar a API principal.

Baileys usa o protocolo do WhatsApp Web e não é uma integração oficial. A sessão possui chaves criptográficas de longa duração que mudam durante o uso. A conexão também é persistente, portanto não se comporta como um job de execução única.

## Decisão

- `whatsapp_web` é a capacidade do canal; `baileys` é somente um driver selecionado por `WHATSAPP_WEB_DRIVER`.
- O driver implementa `ConversationProvider`. Casos de uso e repositórios não importam Baileys.
- O conector roda no processo separado `pnpm whatsapp:worker`. Ele pode subir junto ao deploy como serviço persistente, sem porta pública, e nunca dentro do processo HTTP da API.
- O recurso fica `disabled` por padrão. Uma instalação precisa habilitar conscientemente o driver, a fila BullMQ e a chave de criptografia das sessões.
- Cada canal pertence a um pastor. O pareamento, a consulta do QR e a desconexão usam `channels.manage_own` ou `channels.manage_all` no controller e novamente no caso de uso.
- O QR é efêmero, nunca entra em logs ou auditoria e é devolvido com `Cache-Control: no-store` somente ao usuário autorizado.
- Credenciais e chaves Signal são serializadas como estado opaco, criptografadas com AES-256-GCM e persistidas em uma tabela tenant-direct com RLS forçada e FK composta para o canal.
- O worker recebe `tenantId` confiável no job, abre uma transação com `set_config(..., true)` e nunca usa uma conexão sem contexto como fallback.
- Na primeira etapa, somente conversas individuais e mensagens textuais iniciadas ou respondidas por uma pessoa são suportadas. Grupos, newsletters, status, chamadas e anexos sem legenda são ignorados.
- Uma mensagem individual recebida cria ou reutiliza a conversa daquele contato no canal e a atribui ao proprietário do canal. O identificador do provedor torna a gravação idempotente.
- Uma resposta é persistida antes de entrar na fila. O worker só marca `sent` após o Baileys devolver um identificador de mensagem; falha terminal permanece visível como `failed`.
- O broker oferece entrega pelo menos uma vez. Como o protocolo não oferece uma chave idempotente de envio controlada pela aplicação, uma queda entre o aceite do WhatsApp e a confirmação no banco pode produzir uma resposta duplicada; a interface não promete exactly-once.
- Modelos editoriais locais podem ajudar o pastor a escrever, mas templates oficiais da Meta e seus estados de aprovação não se aplicam a `whatsapp_web`.
- O processo de teste roda com uma única réplica. Escala horizontal exige lock distribuído por canal antes de ser habilitada.
- Envio em massa, campanhas e lembretes automáticos não usam esse driver. Esses fluxos continuam dependentes de um canal oficialmente suportado e das regras de consentimento.

## Alternativas consideradas

- Executar Baileys dentro da API: rejeitada porque uma queda ou vazamento de memória do socket afetaria autenticação, eventos e inscrições.
- Salvar `useMultiFileAuthState` em um volume sem criptografia: rejeitada porque o diretório contém chaves de longa duração e dificulta isolamento por tenant.
- Criar `provider_key = baileys`: rejeitada porque trocar a biblioteca obrigaria a alterar canais e regras de negócio já persistidos.
- Usar um job de deploy de execução única: rejeitada porque o socket precisa permanecer conectado para receber mensagens.
- Habilitar lembretes automáticos no primeiro teste: rejeitada pelo risco operacional e pelas restrições do WhatsApp contra automação não autorizada.

## Consequências

Uma instalação pode trocar Baileys por outro driver de WhatsApp Web implementando as mesmas portas. O processo separado, a criptografia, a supressão dos logs internos do driver e a RLS reduzem o impacto de falhas, mas não tornam a integração oficial nem eliminam o risco de desconexão, duplicidade em retentativas ou bloqueio do número. Para produção com garantia de suporte, a recomendação continua sendo a plataforma oficial da Meta.
