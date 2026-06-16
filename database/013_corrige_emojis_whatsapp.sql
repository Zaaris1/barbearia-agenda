-- V1.11.1 - Correção de caracteres inválidos nas mensagens de WhatsApp
-- Execute uma vez no SQL Editor do Supabase.

update public.barbershops
set whatsapp_confirmation_template = nullif(replace(coalesce(whatsapp_confirmation_template, ''), '�', ''), ''),
    whatsapp_reminder_template = nullif(replace(coalesce(whatsapp_reminder_template, ''), '�', ''), ''),
    whatsapp_cancellation_template = nullif(replace(coalesce(whatsapp_cancellation_template, ''), '�', ''), '')
where coalesce(whatsapp_confirmation_template, '') like '%�%'
   or coalesce(whatsapp_reminder_template, '') like '%�%'
   or coalesce(whatsapp_cancellation_template, '') like '%�%';
