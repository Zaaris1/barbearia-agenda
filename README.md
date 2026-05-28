# Barbearia Agenda V1.1

App de agendamentos para barbearia com React + Vite + Supabase + Cloudflare Pages.

## O que existe na V1

- Login interno por PIN.
- Dashboard diário.
- Agenda por data, barbeiro e status.
- Criar, confirmar, iniciar, concluir, cancelar, remarcar e marcar falta.
- Cadastro de clientes.
- Cadastro de serviços.
- Cadastro de barbeiros e PINs.
- Financeiro diário básico.
- Página pública de agendamento.
- Bloqueio de conflito de horário no banco.

## Novidades da V1.1

- Nova aba **Configurações** para administrador.
- Alteração do nome da barbearia, slug/link público, WhatsApp, endereço e intervalo padrão.
- Botão para copiar/abrir link público.
- Página pública de agendamento redesenhada com visual mais profissional.
- Botão de WhatsApp na tela de sucesso quando houver telefone cadastrado.
- Ajuste definitivo do `api.js` para preservar listas retornadas pelo Supabase.
- SQL de atualização `database/004_configuracoes_e_ajustes.sql`.

## Instalação do banco

Para instalação nova, rode no Supabase SQL Editor:

1. `database/001_schema.sql`
2. `database/002_functions.sql`
3. `database/003_seed_demo.sql`
4. `database/004_configuracoes_e_ajustes.sql`

Para quem já está com a V1 funcionando, rode apenas:

1. `database/004_configuracoes_e_ajustes.sql`

## Variáveis de ambiente

No Cloudflare Pages, configure:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
VITE_DEFAULT_SHOP_SLUG=barbearia-demo
```

## Rodar localmente

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

