# Agenda Barbearia

App SaaS para barbearias venderem agendamento online, organizarem equipe, clientes, pagamentos Pix e rotina operacional em um painel unico.

## Visao Geral

- Frontend em React + Vite.
- Backend via Supabase RPCs e SQL versionado em `database/`.
- Landing page publica em `/`.
- Portal da barbearia em `/{slug}`.
- Agendamento publico em `/agendar/{slug}`.
- Area do cliente em `/meus-agendamentos/{slug}`.
- Painel interno em `/app/{slug}`.
- Painel master em `/master`.

## Como Rodar Localmente

```bash
npm install
npm run dev
```

O Vite abre em uma porta local e aceita acesso pela rede por causa do `--host 0.0.0.0`.

## Variaveis De Ambiente

Crie um `.env.local` com base no `.env.example`:

```txt
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_DEFAULT_SHOP_SLUG=barbearia-demo
VITE_SALES_WHATSAPP=
```

Nao versionar valores reais de Supabase, WhatsApp comercial ou qualquer chave de ambiente.

## Build

```bash
npm run build
npm run preview
```

Scripts disponiveis:

- `npm run dev`: inicia o ambiente local.
- `npm run build`: gera a pasta `dist`.
- `npm run preview`: testa o build localmente.
- `npm run clean`: remove `dist`.
- `npm run check`: executa o build como verificacao.

## Deploy Cloudflare Pages

Configuracao recomendada:

- Build command: `npm run build`
- Build output directory: `dist`
- Variaveis: preencher as mesmas chaves do `.env.example` no painel do Cloudflare.

O arquivo `public/_redirects` deve ser preservado para fallback SPA. A pasta `dist` e uma saida de build; se ela aparecer versionada por historico do projeto, trate como artefato gerado e nao como fonte principal.

## Rotas Principais

- `/`: landing page comercial.
- `/{slug}`: portal publico da barbearia.
- `/agendar/{slug}`: fluxo publico de agendamento.
- `/meus-agendamentos/{slug}`: consulta e cancelamento de agendamentos pelo cliente.
- `/app/{slug}`: login por PIN e painel interno.
- `/master`: painel da plataforma.

## Observacoes De Seguranca

- Nao alterar nomes de RPCs ou payloads sem sincronizar com os SQLs em `database/`.
- Nao commitar `.env`, `.env.local`, logs ou `node_modules`.
- O frontend usa chave anonima do Supabase; regras sensiveis devem permanecer no backend/RPC.
- Sessao, mensalidade, Pix, master e agendamento sao fluxos criticos. Mudancas nesses pontos devem ser pequenas, testadas e revisadas.
