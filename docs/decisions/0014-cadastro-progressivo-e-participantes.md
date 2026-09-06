# 0014 — Cadastro individual com confirmação de participantes

Status: aceita

## Contexto

Os formulários anteriores repetiam telefone, cônjuge, data de casamento e filhos em cada evento. A conta deve continuar individual, mas uma pessoa pode confirmar quais familiares irão e selecionar opções eventuais, como um café da manhã.

## Decisão

- Manter uma identidade individual por conta e evoluir o perfil complementar como fonte reutilizável.
- Permitir que o evento habilite a seleção familiar sem torná-la obrigatória para todos os eventos.
- Modelar a inscrição como responsabilidade de uma conta e os participantes como fotografias daquela ocorrência.
- Guardar adicionais opcionais do evento e suas seleções separadamente da inscrição e do futuro contexto de pagamentos.
- Contar capacidade por participante e permitir check-in individual, mantendo uma ação de grupo como atalho operacional.
- Não implementar aprovação entre cônjuges nem resolução sofisticada de duplicidade no MVP, conforme a expectativa de coordenação da própria família.
- Expor no convite somente dados públicos do PIX manual e apenas quando forem úteis; referências secretas de gateway permanecem na infraestrutura.

## Consequências

O membro informa dados familiares uma vez, revisa o que mudou e assinala quem irá. Eventos simples continuam confirmando somente a própria pessoa. A operação passa a distinguir inscrições, pessoas esperadas, presenças e adicionais escolhidos.

As novas tabelas são tenant-direct, usam chaves compostas e RLS forçada. Alterações de perfil e participantes são auditadas sem copiar conteúdo pessoal para a trilha genérica.
