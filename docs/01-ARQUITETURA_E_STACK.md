# 01 - Arquitetura e Stack Oficial

Este documento define a arquitetura e a stack tecnológica oficial do **VamoAgendar**, um SaaS B2B2C de agendamento online focado em profissionais independentes e pequenas empresas no Brasil.

---

## 🚀 Stack Oficial e Definitiva

Toda a engenharia do projeto deve seguir estritamente as tecnologias e ferramentas abaixo:

1. **Frontend & API:**
   * **Next.js 16 (App Router):** Roteamento avançado, Server Components por padrão para performance e SEO, e Server Actions para mutação de dados.
   * **React 19:** Utilização das novidades do React 19 (Server Actions, hooks nativos de formulários).
   * **Tailwind CSS v4:** Estilização utilitária de última geração, mantendo foco total em responsividade e design *mobile-first*.

2. **Autenticação & Multi-tenant:**
   * **Clerk:** Provedor oficial de identidade. Utiliza a funcionalidade de **Organizations** para estruturar e isolar as empresas (tenants).

3. **Banco de Dados:**
   * **Supabase (PostgreSQL):** Utilização do cliente oficial `@supabase/ssr` para comunicação direta, tirando proveito das políticas de segurança baseadas em linha (RLS - Row Level Security).
   * **NÃO UTILIZA ORM:** Qualquer ORM (como Prisma ou Drizzle) está explicitamente descartado. O acesso é feito via Supabase Client padrão.

4. **Pagamentos & Assinaturas:**
   * **Asaas:** Gateway de pagamento focado no mercado brasileiro, gerenciando Pix e planos de assinatura pré-pagos via links de checkout.

5. **Mensageria & Filas:**
   * **Upstash QStash:** Escalabilidade de filas *serverless* para agendamento de tarefas em background e envio de lembretes futuros.

6. **Notificações:**
   * **Resend:** Disparo de e-mails transacionais (boas-vindas, confirmação, faturamento).
   * **Evolution API / Z-API:** Gateway para integração de WhatsApp via QR Code para notificações instantâneas de agendamento e lembretes aos clientes finais.

---

## 🏢 Modelo de Negócio Multi-tenant B2B2C

O **VamoAgendar** opera em um modelo com duas frentes claras:
* **B2B (Business-to-Business):** A plataforma atende profissionais e pequenas empresas (tenants) que assinam o SaaS para gerenciar seus horários, funcionários, serviços e configurações.
* **B2C (Business-to-Consumer):** A plataforma fornece uma página pública de agendamento ("Link na Bio") para que os clientes finais desses profissionais possam selecionar serviços, profissionais e agendar horários de forma totalmente autônoma.

O isolamento dos dados de cada empresa é garantido no banco de dados (Supabase) a nível de linha (RLS), utilizando a identificação de organização fornecida pelo Clerk (`org_id`).

---

## ⚠️ AVISO IMPORTANTE: Tecnologias Descartadas (Pivô)

Durante as etapas de concepção inicial, foram cogitadas algumas tecnologias que foram **oficialmente descontinuadas e substituídas**. Sob nenhuma circunstância utilize ou instale:

* ❌ **Prisma / Drizzle:** Descartados. O banco é acessado diretamente pelo cliente Supabase.
* ❌ **better-auth:** Substituído pelo **Clerk**.
* ❌ **Mercado Pago:** Substituído pelo **Asaas**.

Qualquer código ou referência remanescente a estas três tecnologias em arquivos legados deve ser desconsiderado ou ativamente refatorado para a Stack Oficial.
