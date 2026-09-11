# Guia de uso do MVP

O nome exibido na instalação vem de `APP_NAME`. Os menus aparecem conforme as permissões do usuário; esconder um menu não concede nem revoga acesso — a API repete a autorização em toda operação protegida.

## Primeiro acesso do administrador

1. Entre com a conta inicial criada pelo seed ou pelo provisionamento da instalação.
2. Abra **Papéis e acessos** e crie os papéis adequados à comunidade.
3. Libere somente as permissões necessárias. Use acessos globais, como supervisão de todas as conversas ou eventos, apenas para quem realmente supervisiona a comunidade.
4. Abra **Configurações** para preparar login social, PIX e integrações. Uma configuração só funciona quando o adapter correspondente está instalado no servidor.
5. Crie contas individuais; não compartilhe a conta administrativa.

## Criar e publicar um evento

1. Em **Eventos**, crie o evento e informe data, local, prazo e capacidade quando aplicáveis.
2. Monte o formulário apenas com informações específicas daquele evento. Dados persistentes do membro são reaproveitados pelo cadastro progressivo.
3. Configure participantes familiares e adicionais opcionais, como café da manhã, quando fizerem parte do evento.
4. Escolha imagens, modo de exibição, cor do hero e, opcionalmente, uma galeria anterior vinculada.
5. Vincule uma configuração PIX se houver adicionais pagos. A marca “já efetuei o PIX” é autodeclaração; o MVP não concilia pagamento automaticamente.
6. Revise a página pública, publique e compartilhe o link ou QR Code.

Quem já possui conta entra por e-mail ou telefone verificado. O contexto de inscrição preenche os dados disponíveis e permite selecionar as pessoas da família; campos ausentes podem ser completados progressivamente.

## Acompanhar inscrições e presença

Abra o evento para consultar inscrições, participantes, adicionais e indicadores. O check-in é individual por participante e pode ser desfeito por quem possui `events.checkin`. Fechar inscrições impede novas confirmações; concluir e cancelar são ações distintas e ficam na auditoria.

## Membros

Em **Membros**, pessoas autorizadas podem:

- corrigir o nome recebido de um contato do WhatsApp;
- completar telefone, nascimento, endereço, cônjuge e filhos;
- registrar a escolha de receber comunicação pelo WhatsApp;
- iniciar ou localizar uma conversa;
- criar uma entrega de acesso/atualização cadastral e enviar o link manualmente.

Dados complementares são opcionais para participar. Informações pessoais e de menores exigem permissões próprias e tratamento compatível com a política da instalação.

## Conversas e canais

Cada pastor pode ter seu próprio canal. Em **Conversas → Canais**, conecte um canal suportado pela instalação. O modo por QR Code é experimental, individual e depende do worker persistente; a Meta Cloud API é o caminho oficial para integrações com garantia operacional.

Ao abrir uma conversa, é possível responder, citar, reagir e anexar imagem ou áudio conforme o adapter. O histórico remoto é sincronizado de forma assíncrona. Um canal só pode ser excluído quando suas dependências permitirem; desconecte-o primeiro quando a interface indicar.

## Acompanhamento pastoral

Em **Acompanhamento**, transforme uma conversa em cartão, escolha responsável, etapa e etiquetas, registre próxima ação e adicione notas. Notas privadas são visíveis somente ao autor; notas da equipe seguem as permissões do contexto. Excluir um cartão é uma permissão independente e gera auditoria.

## Comunicação e lembretes

Modelos locais ficam em **Comunicação** e possuem versões imutáveis. O evento referencia uma versão ao criar uma regra de lembrete. Ativar a regra não garante envio: scheduler, consentimento e adapter de entrega precisam estar operacionais. Templates oficiais da Meta são sincronizados pelo canal e a Meta continua sendo a fonte do status de aprovação.

## Galerias

Crie uma galeria a partir de um evento concluído, escolha visibilidade, capa, ordem, legenda e texto alternativo. Após publicar, compartilhe sua página. Um evento novo pode vincular qualquer galeria permitida da comunidade, sem duplicar suas fotos.

## Auditoria e sessões

**Auditoria** mostra criações, alterações e exclusões com paginação por cursor e filtros. Ela não deve exibir segredos nem conteúdo pessoal sensível. Em **Sessões**, encerre outros acessos quando houver troca ou perda de dispositivo; fechar a aba exige novo login porque a prova da sessão não é persistida fora dela.

