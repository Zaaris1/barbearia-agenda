# Barbearia Agenda V1.6

App de agendamentos para barbearias feito com React + Vite + Supabase + Cloudflare Pages.

## V1.6 - Confirmação por WhatsApp

Nesta versão foi adicionada a confirmação via WhatsApp sem API:

- Ao clicar em **Confirmar** no card do agendamento, o status muda para `CONFIRMADO` e o WhatsApp do cliente abre com mensagem pronta.
- Após o agendamento estar confirmado, o card mostra o botão **Enviar confirmação** para reenviar/abrir a mensagem novamente.
- A mensagem usa automaticamente nome do cliente, serviço, barbeiro, data, horário, valor, nome da barbearia, endereço e telefone da barbearia quando disponíveis.
- O telefone do cliente é normalizado para link `wa.me`, adicionando `55` quando necessário.

## Observação importante

Esta versão não envia a mensagem automaticamente pela API oficial do WhatsApp. Ela abre o WhatsApp com a mensagem preenchida para o barbeiro/admin tocar em enviar.

Isso evita custo com API, aprovação da Meta e necessidade de backend/webhook.

## Arquivos principais alterados

- `src/components/AppointmentCard.jsx`
- `src/pages/Agenda.jsx`
- `src/lib/whatsapp.js`
- `src/styles/global.css`

## Banco de dados

Não precisa rodar SQL novo nesta versão.

## Deploy

Suba/substitua os arquivos no GitHub e aguarde o Cloudflare Pages publicar automaticamente.

Mantenha o `package-lock.json` fora do GitHub se o Cloudflare voltar a travar em `npm clean-install`.


## V1.7 - Portal inicial da barbearia

A V1.7 adiciona uma tela inicial única para cada barbearia. Assim, em vez de divulgar dois links separados, você pode divulgar apenas:

```txt
https://barbearia-agenda.pages.dev/barbearia-demo
```

Nessa tela, o visitante escolhe:

```txt
Sou cliente -> /agendar/barbearia-demo
Sou barbeiro / administrador -> /app/barbearia-demo
```

O painel master continua separado em:

```txt
/master
```

Links antigos continuam funcionando:

```txt
/app/barbearia-demo
/agendar/barbearia-demo
```

Não é necessário rodar SQL novo para a V1.7.

## V1.7.2 - Refinamento do portal inicial

- Card principal de cliente com mais destaque visual.
- Botão de agendamento mais forte como CTA principal.
- Acesso de barbeiro/admin mantido como opção secundária e discreta.
- Ajustes de responsividade para mobile.


## V1.7.2

- Card principal de cliente com contraste corrigido.
- Botão de agendamento com mais destaque visual.
- Acesso de barbeiro/admin mantido secundário.


## V1.7.4

- Card principal de cliente transformado em CTA visual claro.
- Botão “Começar agendamento” com aparência real de ação.
- Card do barbeiro/admin mantido como opção secundária.


## V1.7.4

Correção definitiva do CTA principal do cliente no portal inicial, com fundo dourado fixo, texto legível e botão “Começar agendamento” mais evidente.

## V1.7.5

Correção de rolagem no portal inicial em celulares: remove travamento de scroll vertical, evita overflow horizontal e mantém o visual aprovado da V1.7.4.

## V1.7.6

Correção final de rolagem no mobile/Safari do portal inicial da barbearia.

Arquivos alterados:

- `src/styles/global.css`
- `README.md`

Não precisa rodar SQL novo.


## V1.7.7

Correção forte de rolagem mobile/Safari no portal inicial da barbearia. Remove animação de entrada do portal, força o scroll no body/documento e reduz efeitos pesados no mobile para evitar travamentos ao rolar.
