# Barbearia Agenda V1.10

Versão com comissão dos barbeiros, relatório por barbeiro e tela de bloqueio comercial mais profissional.

## Principais recursos acumulados

- Multi-barbearias
- Painel master
- Controle de mensalidades e bloqueio
- Portal inicial cliente/barbeiro
- Agendamento público
- Agenda interna
- Pix manual com QR Code e copia e cola
- Confirmação por WhatsApp
- Lembrete por WhatsApp
- Relatórios financeiros
- PDF/Salvar relatório
- Identidade visual por barbearia
- Upload de logo, banner e favicon pelo painel
- Comissão dos barbeiros
- Relatório por barbeiro
- Tela de bloqueio comercial mais bonita
- Responsivo/mobile ajustado

## Arquivos alterados na V1.10

Substitua no GitHub:

```txt
src/lib/api.js
src/pages/Barbeiros.jsx
src/pages/Financeiro.jsx
src/pages/Login.jsx
src/styles/global.css
README.md
```

Suba também o SQL novo:

```txt
database/011_comissoes_relatorio_barbeiro_bloqueio.sql
```

## SQL

Depois de subir os arquivos no GitHub, rode no Supabase somente:

```txt
database/011_comissoes_relatorio_barbeiro_bloqueio.sql
```

Abra o arquivo, copie o conteúdo completo e cole no SQL Editor do Supabase.

## Comissão dos barbeiros

No painel da barbearia:

```txt
Barbeiros > Editar barbeiro > Comissão do barbeiro
```

Opções:

- Comissão desativada
- Comissão percentual sobre atendimentos concluídos
- Comissão fixa por atendimento concluído

A comissão é calculada no relatório financeiro sobre atendimentos com status `CONCLUIDO`.

## Relatório por barbeiro

No menu:

```txt
Financeiro
```

Agora a seção `Resultado por barbeiro` mostra:

- faturamento recebido
- quantidade de concluídos
- regra de comissão
- valor da comissão
- líquido estimado da barbearia

Clique no barbeiro para abrir o relatório detalhado dele no mês.

## Tela de bloqueio comercial

Quando uma barbearia estiver bloqueada por mensalidade, a tela de login mostra um card comercial explicando o bloqueio, em vez de apenas um erro simples.

## Observação Cloudflare

O pacote continua sem `package-lock.json` para evitar o problema do Cloudflare com `npm clean-install`.
