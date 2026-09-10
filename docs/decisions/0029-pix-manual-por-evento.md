# 0029 — Pix manual vinculado ao evento

## Contexto

Eventos podem oferecer itens pagos, como café da manhã. A configuração existente guardava uma chave Pix da comunidade, mas não permitia ao criador decidir em quais eventos ela seria exibida nem registrava a declaração do membro.

## Decisão

- O evento referencia explicitamente a integração `pix_manual` habilitada da própria comunidade.
- O QR Code segue o BR Code estático e é gerado no navegador com a soma dos adicionais pagos selecionados.
- A inscrição com Pix exige que o membro marque “Já efetuei o Pix”. O servidor persiste o instante, o valor informado e a integração usada.
- Essa marca é uma autodeclaração. Ela nunca recebe o estado de pagamento conciliado ou confirmado pelo sistema.
- A chave continua administrada em Configurações por `settings.manage`; seu uso no evento exige acesso de leitura às configurações e a permissão correspondente de criação ou edição do evento.
- A referência entre evento, inscrição e integração inclui `tenant_id`, impedindo vínculos entre comunidades.

## Consequências

O fluxo manual funciona sem provedor proprietário e pode ser substituído no futuro por um `PaymentGateway`. Confirmação bancária, webhook, reembolso e conciliação continuam fora deste MVP e precisarão de estados próprios no contexto de pagamentos.
