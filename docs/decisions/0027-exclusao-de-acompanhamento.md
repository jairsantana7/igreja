# 0027 — Exclusão de acompanhamento

Status: aceita

## Contexto

O quadro de acompanhamento pode acumular cartões criados por engano, duplicados ou que deixaram de fazer sentido. Excluir um acompanhamento não deve apagar o cadastro da pessoa nem o histórico de comunicação que originou o cartão.

## Decisão

- A exclusão é definitiva para o agregado de acompanhamento e exige confirmação explícita na interface.
- A ação remove o cartão, suas etiquetas, anotações, vínculos com conversas e histórico de etapas.
- O membro, as conversas e as mensagens vinculadas são preservados.
- A autorização usa a permissão granular `followups.delete`, separada da edição de cartões.
- Sem `followups.read_all`, o usuário pode excluir somente acompanhamentos sob sua responsabilidade. Com supervisão, o mesmo escopo ampliado vale para a exclusão.
- A operação passa pela transação com contexto de tenant e é registrada pela auditoria do banco de dados.

## Consequências

- Administradores do sistema recebem a nova permissão na migração; os demais papéis podem recebê-la pela tela de acessos.
- As remoções em cascata são limitadas às tabelas internas do agregado de acompanhamento.
- A decisão não cria tabelas e, portanto, não altera a classificação de RLS.
