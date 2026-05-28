# Barbearia Agenda V1.3

App de agendamentos para barbearias em **React + Vite + Supabase + Cloudflare Pages**.

## V1.3 - Identidade visual

Inclui:

- Multi-barbearias
- Painel master em `/master`
- Controle de mensalidades e bloqueio
- Painel interno por barbearia em `/app/:slug`
- Agendamento público em `/agendar/:slug`
- Logo por barbearia
- Banner/capa por barbearia
- Favicon dinâmico por barbearia
- Slogan
- WhatsApp
- Instagram
- Horário de funcionamento em texto
- Presets visuais prontos
- Cores personalizadas
- QR Code do link público
- Botão copiar/compartilhar link público
- Página pública redesenhada com identidade da barbearia

## Instalação/atualização do banco

Se você já está na V1.2, rode apenas:

```sql
-- Conteúdo do arquivo database/006_branding_identidade_visual.sql
```

Não cole o nome do arquivo no Supabase. Abra o arquivo, copie todo o conteúdo e cole no SQL Editor.

## Links principais

Painel master:

```txt
/master
```

Painel interno de uma barbearia:

```txt
/app/barbearia-demo
```

Agendamento público:

```txt
/agendar/barbearia-demo
```

## Variáveis do Cloudflare Pages

```txt
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_publishable
VITE_DEFAULT_SHOP_SLUG=barbearia-demo
```

## Build

```bash
npm install
npm run build
```

## Observação sobre imagens

Nesta versão, logo, capa e favicon são configurados por **URL direta de imagem**.
Você pode usar links de imagens hospedadas em qualquer lugar público. Futuramente pode ser incluído upload direto via Supabase Storage.
