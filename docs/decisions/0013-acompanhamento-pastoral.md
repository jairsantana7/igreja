# 0013 — Acompanhamento pastoral como contexto próprio

Status: aceita

## Contexto

Pastores precisam organizar contatos, registrar próximos passos e compartilhar contexto com a equipe. Colocar etapa e notas diretamente na conversa faria a jornada depender de um número ou fornecedor, embora uma pessoa possa ter várias conversas e participar de vários eventos.

## Decisão

- Criar o bounded context `Acompanhamento pastoral` separado de conversas.
- O acompanhamento referencia uma pessoa, um responsável, uma etapa e zero ou mais conversas e etiquetas.
- O Kanban é uma projeção das etapas configuráveis da comunidade.
- Movimentações criam histórico imutável próprio.
- Notas possuem visibilidade privada ou da equipe, não são conteúdo de mensagem e recebem permissões específicas.
- O primeiro fluxo cria o acompanhamento a partir de uma conversa; origens adicionais podem ser incluídas sem alterar o agregado.

## Alternativas consideradas

- Transformar a conversa em card: rejeitada porque mistura transporte com relacionamento e perde continuidade quando o contato troca de canal.
- Usar nomes fixos de etapas no domínio: rejeitada porque cada comunidade organiza o cuidado de forma diferente.
- Guardar notas na auditoria genérica: rejeitada para reduzir exposição de dados pastorais sensíveis.

## Consequências

A interface ganha um quadro próprio e um atalho contextual na conversa. O contexto adiciona tabelas tenant-direct, políticas RLS, permissões granulares e uma obrigação explícita de retenção e acesso mínimo para notas.
