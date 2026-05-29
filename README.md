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
