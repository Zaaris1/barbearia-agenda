# Barbearia Agenda V1.2

App de agendamentos para barbearias feito com React + Vite + Supabase, publicado no Cloudflare Pages e gerenciado pelo GitHub.

## O que existe nesta versão

- Painel interno por barbearia: `/app/:slug`
- Link público de agendamento por barbearia: `/agendar/:slug`
- Painel master da plataforma: `/master`
- Cadastro de múltiplas barbearias no mesmo banco
- Separação dos dados por `barbershop_id`
- Controle de mensalidade por barbearia
- Bloqueio automático quando passar do vencimento + tolerância
- Bloqueio manual pelo painel master
- Registro de pagamento e renovação do vencimento
- Login interno por PIN
- Agenda, clientes, barbeiros, serviços, dashboard e financeiro diário

## Instalação no Supabase

Se estiver instalando do zero, rode os SQLs nesta ordem:

```txt
001_schema.sql
002_functions.sql
003_seed_demo.sql
004_configuracoes_e_ajustes.sql
005_multibarbearias_mensalidades.sql
```

Se você já estava na V1.1, rode somente:

```txt
database/005_multibarbearias_mensalidades.sql
```

Não cole o caminho do arquivo no SQL Editor. Abra o arquivo, copie o conteúdo completo e cole no Supabase.

## Acessos iniciais

Painel interno demo:

```txt
/app/barbearia-demo
```

Agendamento público demo:

```txt
/agendar/barbearia-demo
```

Painel master:

```txt
/master
```

PINs iniciais:

```txt
Barbearia demo admin: 1234
Barbeiro demo: 1111
Master: 9999
```

Depois de validar, troque o PIN master no Supabase com:

```sql
update public.platform_admins
set pin_hash = crypt('NOVO_PIN_AQUI', gen_salt('bf'))
where name = 'Master';
```

## Variáveis do Cloudflare Pages

```txt
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publishable-ou-anon
VITE_DEFAULT_SHOP_SLUG=barbearia-demo
```

## Build

```bash
npm install
npm run build
```

## Fluxo recomendado

1. Acesse `/master`.
2. Entre com PIN master.
3. Crie uma nova barbearia.
4. Copie o link interno `/app/slug-da-barbearia`.
5. Copie o link público `/agendar/slug-da-barbearia`.
6. Cadastre serviços, barbeiros e PINs dentro do painel interno da barbearia.
7. Controle mensalidade, vencimento, status e bloqueio pelo painel master.
