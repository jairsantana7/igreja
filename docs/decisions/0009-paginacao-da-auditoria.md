# 0009 — Paginação por cursor da auditoria

Status: aceita

## Contexto

A trilha de auditoria cresce continuamente. Um limite fixo esconde o histórico antigo, enquanto paginação por `OFFSET` precisa percorrer e descartar cada vez mais linhas e pode deslocar resultados quando novos eventos são inseridos.

## Decisão

- A ordenação será `(created_at DESC, id DESC)`, formando uma posição total e estável.
- A API devolverá `items` e `nextCursor`; o cursor codifica somente o horário e o identificador da última linha.
- O caso de uso validará limite, filtros e cursor inclusive quando chamado fora do HTTP.
- O limite padrão será 25 e o máximo será 100 registros.
- Filtros de ação e evento serão aplicados pelo PostgreSQL antes da paginação.
- Índices específicos atenderão a ordenação geral, o filtro de ação e o vínculo do evento, sempre iniciando pelo tenant.

## Alternativas consideradas

- Retornar somente as 100 atividades recentes: rejeitada porque torna o restante do histórico inacessível.
- Usar `OFFSET` e número de página no banco: rejeitada pelo custo crescente e pela instabilidade com novas inserções.
- Contar todas as linhas em cada consulta: rejeitada porque a contagem não é necessária para navegar e pode ficar cara.

## Consequências

A navegação seguinte mantém custo previsível e não repete linhas por causa de novas inserções. O cliente pode informar a página visitada usando seu histórico local, mas a API não promete total de páginas nem acesso aleatório a uma página distante.
