# Imagens da galeria de demonstração

Estas imagens são dados sintéticos gerados para demonstrar a galeria pública da instalação local. Pessoas e eventos retratados são fictícios; os arquivos não devem ser confundidos com registros da comunidade de quem instala o projeto.

O seed copia os originais para o `MediaStorage` local e gera versões WebP de exibição e miniatura usando a porta `GalleryImageProcessor`. Os identificadores e nomes de arquivo são determinísticos para que novas execuções de `pnpm db:seed` não criem mídias duplicadas.
