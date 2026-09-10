# 0030 — Login por e-mail ou telefone verificado

Status: aceita

## Contexto

Membros da comunidade usam o WhatsApp com mais frequência que o e-mail e já informam esse contato no perfil complementar. Repetir a exigência do e-mail em cada evento aumenta o atrito, mas consentimento para receber mensagens não comprova a posse do número.

## Decisão

- O login local recebe um único identificador e aceita e-mail ou telefone, sempre acompanhado da senha.
- Telefones brasileiros digitados com ou sem formatação são normalizados para E.164; números sem DDD são rejeitados no domínio.
- Um telefone só participa da resolução de login depois de verificado. A conclusão do convite cadastral entregue ao mesmo número e a criação a partir de uma conversa recebida são os fluxos confiáveis atuais.
- Alterar o número remove a verificação, salvo quando o próprio fluxo confiável confirma explicitamente o novo valor.
- O telefone normalizado é único por comunidade. A mesma pessoa pode ter identidades distintas em comunidades diferentes, sem consulta cruzada.
- O resolver público continua estreito: primeiro resolve o tenant pelo slug, instala o contexto transacional de RLS e só então procura e-mail ou telefone verificado.
- Erros de login permanecem genéricos e as rotas mantêm o rate limit restrito. Telefone não pode ser usado para recuperação de senha ou OTP sem um fluxo adicional de verificação.

## Consequências

O formulário pode mostrar “E-mail ou WhatsApp” sem acoplar a autenticação ao fornecedor do WhatsApp. Cônjuge e filhos cadastrados no perfil não recebem identidade própria automaticamente. Instalações existentes só habilitam números que possuam evidência de verificação; nenhuma autorização de comunicação é promovida silenciosamente.
