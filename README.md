# Barbearia Agenda V1

App de agendamentos para barbearia feito com **React + Vite + Supabase**, preparado para publicar no **Cloudflare Pages** e gerenciar pelo **GitHub**.

## O que já vem nesta V1

- Login interno por PIN
- Perfil de administrador e barbeiro
- Dashboard diário
- Agenda com filtros por data, barbeiro e status
- Criação de agendamento interno
- Remarcar, confirmar, iniciar, concluir, cancelar e marcar falta
- Cadastro de clientes
- Cadastro de serviços
- Cadastro de barbeiros
- Financeiro diário básico
- Página pública de agendamento
- Bloqueio de conflito de horário direto no banco
- Interface escura premium e responsiva para celular

## Estrutura

```txt
barbearia-agenda-v1/
  public/
    _redirects
  src/
    components/
    pages/
    lib/
    styles/
  database/
    001_schema.sql
    002_functions.sql
    003_seed_demo.sql
  .env.example
  package.json
  vite.config.js
```

## Como instalar o banco no Supabase

1. Crie um projeto no Supabase.
2. Acesse **SQL Editor**.
3. Execute os arquivos nesta ordem:
   - `database/001_schema.sql`
   - `database/002_functions.sql`
   - `database/003_seed_demo.sql`

Depois disso, a demo estará criada com:

```txt
Barbearia: barbearia-demo
PIN admin: 1234
PIN barbeiro: 1111
```

## Como rodar localmente

Crie um arquivo `.env` com base no `.env.example`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
VITE_DEFAULT_SHOP_SLUG=barbearia-demo
```

Instale e rode:

```bash
npm install
npm run dev
```

Acesse:

```txt
http://localhost:5173
```

Página pública:

```txt
http://localhost:5173/agendar/barbearia-demo
```

## Como publicar no Cloudflare Pages

1. Suba este projeto para um repositório no GitHub.
2. No Cloudflare Pages, escolha **Create a project**.
3. Conecte com o GitHub.
4. Configure:

```txt
Framework preset: Vite
Build command: npm run build
Build output directory: dist
```

5. Em **Environment Variables**, configure:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_DEFAULT_SHOP_SLUG=barbearia-demo
```

6. Faça o deploy.

## Rotas principais

```txt
/                       Painel interno
/agendar/barbearia-demo  Agendamento público
/?publico=1              Agendamento público usando slug padrão
```

## Observações importantes

- Esta V1 usa PIN com hash no banco, não salva PIN puro.
- O frontend conversa com o Supabase por funções RPC.
- As tabelas estão com RLS ativado.
- A página pública não acessa dashboard, clientes, financeiro nem agenda completa.
- O conflito de horário é validado no banco usando bloqueio transacional.

## Próximas evoluções sugeridas

- Logo/nome/cores por barbearia
- Confirmação automática por WhatsApp
- Link de remarcação para cliente
- Relatório mensal
- Comissão por barbeiro
- Ranking de serviços
- Histórico detalhado por cliente
- Múltiplas unidades/barbearias com plano pago
