# 0015 — Login social no convite do evento

Status: aceita

## Contexto

O login social foi proposto para facilitar a confirmação de presença do membro, não como requisito da área administrativa. Misturar os dois fluxos aumentaria a superfície de acesso da equipe e faria o membro perder o contexto do evento que abriu.

## Decisão

- Exibir provedores sociais no cartão da página pública do evento somente quando a comunidade os habilitar e a instalação registrar um adaptador funcional.
- Preservar o evento de origem em estado assinado e de uso único durante autorização e callback.
- Depois da autenticação, recuperar o perfil do membro e retornar à revisão de participantes, adicionais e perguntas.
- Exigir confirmação explícita: concluir o login não cria a inscrição automaticamente.
- Criar uma conta de membro no primeiro acesso quando a identidade trouxer e-mail verificado.
- Não vincular silenciosamente uma identidade social a uma conta local existente apenas porque os e-mails coincidem.
- Não habilitar automaticamente os mesmos provedores na entrada administrativa.

## Consequências

A configuração continua desacoplada de Google ou Microsoft por `ExternalIdentityProvider`. Até existir adaptador instalado e testado, nenhum botão é anunciado na página pública. O fluxo local com e-mail e senha continua como alternativa.
