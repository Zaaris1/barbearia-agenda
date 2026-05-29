# Barbearia Agenda V1.5

App de agendamento para barbearias com React + Vite + Supabase + Cloudflare Pages.

## Recursos principais

- Multi-barbearias no mesmo app
- Painel master em `/master`
- Painel interno por barbearia em `/app/slug-da-barbearia`
- Página pública em `/agendar/slug-da-barbearia`
- Agenda, clientes, barbeiros, serviços e financeiro básico
- Identidade visual por barbearia: logo, capa, favicon, cores, slogan e Instagram
- Controle de mensalidades da plataforma com bloqueio
- Pagamento Pix manual para agendamento público
- QR Code Pix e Pix copia e cola
- Marcação manual de pagamento recebido no painel interno

## Aplicação no projeto existente

1. Substitua os arquivos deste pacote no GitHub.
2. Remova `package-lock.json` do GitHub caso ele exista, para evitar erro de `npm clean-install` no Cloudflare.
3. Rode no Supabase o SQL novo:

```txt
database/008_pix_manual_pagamento.sql
```

Abra o arquivo, copie o conteúdo completo e cole no SQL Editor do Supabase.

## Build

```bash
npm install
npm run build
```

## Variáveis no Cloudflare Pages

```txt
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
VITE_DEFAULT_SHOP_SLUG=barbearia-demo
NODE_VERSION=20
```

## Configuração do Pix

No painel interno da barbearia, entre em:

```txt
Configurações > Pagamento Pix manual
```

Configure:

- Ativar Pix
- Regra de pagamento: opcional, obrigatório/valor total ou sinal
- Chave Pix
- Tipo da chave
- Nome do recebedor
- Cidade do recebedor
- Instruções ao cliente

O cliente verá o QR Code e o Pix copia e cola após solicitar o agendamento.
