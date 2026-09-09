# 0028 — Galerias de eventos

Status: aceita

## Contexto

Eventos concluídos geram registros visuais importantes para a memória e a comunicação da comunidade. Essas fotos precisam de um fluxo editorial próprio, sem transformar o agregado de evento em responsável por publicação, privacidade, processamento de imagens e armazenamento.

## Decisão

- `Galerias` é um bounded context ligado a Eventos por referência. Cada evento concluído pode possuir uma única galeria.
- A galeria nasce como rascunho e pode ser publicada, retirada do ar ou arquivada. Publicar exige ao menos uma foto.
- A visibilidade é `public` ou `members_only`. Galerias públicas usam um UUID opaco compartilhável; galerias exclusivas exigem sessão, permissão `galleries.view` e o mesmo tenant.
- A gestão respeita o responsável e os colaboradores do evento. `galleries.read_own` limita o escopo; `galleries.read_all` habilita supervisão.
- Criar, editar fotos/metadados e publicar usam, respectivamente, `galleries.create`, `galleries.update` e `galleries.publish`. Papéis continuam sendo apenas agrupadores dessas permissões.
- Somente a equipe autorizada envia fotos no MVP. Upload colaborativo por participantes fica fora desta versão porque exige moderação e consentimento adicionais.
- Fotos possuem legenda, texto alternativo, posição e indicação de capa. A galeria aceita até 200 fotos e cada requisição envia até 20 imagens JPEG, PNG ou WebP de até 10 MiB.
- O binário fica em `MediaStorage`; o banco guarda somente chaves opacas e metadados. A versão original é utilizável imediatamente. Quando há fila, um job gera uma versão WebP otimizada e uma miniatura; falha de otimização não torna a original indisponível.
- Pedidos de privacidade são atendidos removendo a foto individual. O sistema não usa reconhecimento facial nem tenta inferir consentimento. A comunidade continua responsável por obter autorização, especialmente para imagens de crianças.
- A reutilização em outro evento é explícita e cria uma nova cópia no storage e um novo `event_media`, mantendo ciclos de vida independentes.
- Um evento também pode destacar, por referência, uma galeria pública e publicada de qualquer evento da mesma comunidade. Esse vínculo usa `galleries.link`, não transfere propriedade e desaparece da página pública quando a galeria deixa de estar disponível.
- Alterações de galeria e foto são auditadas. Conteúdo binário e chaves de storage não aparecem nos logs da aplicação.

## Alternativas consideradas

- Reutilizar `event_media` como galeria: rejeitada porque imagens da página de inscrição e um álbum editorial possuem ciclos de vida e regras de publicação diferentes.
- Guardar arquivos no PostgreSQL: rejeitada por acoplar banco, backup e entrega de mídia.
- Compartilhar a mesma chave de storage entre galeria e evento: rejeitada porque uma exclusão poderia quebrar o outro contexto.
- Copiar todas as fotos para apresentar uma galeria anterior: rejeitada porque duplica arquivos, autoria e trabalho editorial sem necessidade.

## Consequências

- `event_galleries` e `gallery_photos` são tabelas tenant-direct com RLS forçada e FKs compostas. `gallery_public_directory` é um catálogo global sem leitura direta pelo runtime.
- O adapter local serve ao desenvolvimento. Instalações podem substituir `MediaStorage`, `GalleryImageProcessor` e `JobQueue` por S3/R2/MinIO, outro processador e BullMQ/RabbitMQ sem alterar os casos de uso.
- Galerias exclusivas dependem de a comunidade conceder `galleries.view` ao papel de membro.
