# VamoAgendar

Um sistema de agendamento online focado em profissionais independentes. A ideia é simples: o profissional configura seus serviços e horários, ganha um link e os clientes agendam sozinhos.

## Contexto

Este projeto nasceu para resolver um problema muito prático: o tempo gasto trocando mensagens no WhatsApp apenas para encontrar um horário livre na agenda. Ele funciona como um "link na bio" (similar ao Calendly), mas com uma experiência pensada primeiramente para o celular e estrutura para atuar como um SaaS (software as a service) com planos gratuitos e pagos.

O desenvolvimento também serviu como espaço para explorar e consolidar padrões do ecossistema do Next.js 16, como Server Components e Server Actions, além de utilizar a versão mais recente do Tailwind (v4) e o Prisma ORM (v7).

## O que já está funcionando?

O core da aplicação está pronto e funcional:

- **Autenticação e Perfis**: Login e cadastro via email utilizando `better-auth`.
- **Motor de Agendamento**: Uma lógica que cruza o horário de trabalho padrão, a duração do serviço escolhido e as exceções (feriados, folgas, dias bloqueados) para gerar a lista exata de horários disponíveis.
- **Dashboard do Profissional**: Visão geral dos agendamentos do dia, contagem regressiva para o próximo cliente e configuração de disponibilidade.
- **Booking Público**: Fluxo passo a passo para o cliente final realizar o agendamento, focado em conversão e usabilidade mobile.
- **Planos e Limites**: Controle de permissões (como limite de serviços ou customização de cores) dependendo do plano do usuário (Free, Plus, Pro).

## Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Linguagem**: TypeScript
- **Estilo**: Tailwind CSS v4
- **Banco de Dados**: PostgreSQL
- **ORM**: Prisma 7
- **Autenticação**: better-auth
- **Pagamentos**: Mercado Pago SDK
- **Pacotes**: pnpm

## Como rodar o projeto

Você precisará do [Node.js](https://nodejs.org/) (v20+), [pnpm](https://pnpm.io/) e [Docker](https://www.docker.com/) (para rodar o banco de dados localmente).

1. **Instale as dependências:**
   ```bash
   pnpm install
   ```

2. **Suba o banco de dados:**
   O projeto inclui um `docker-compose.yml` já configurado com PostgreSQL.
   ```bash
   docker compose up -d
   ```

3. **Configure as variáveis de ambiente:**
   Copie o arquivo de exemplo e ajuste se necessário. O padrão do `.env.example` já serve para o Docker local.
   ```bash
   cp .env.example .env
   ```

4. **Prepare o banco de dados:**
   Rode as migrations e gere o client do Prisma.
   ```bash
   pnpm prisma migrate dev
   pnpm prisma generate
   ```

5. **Inicie o servidor de desenvolvimento:**
   ```bash
   pnpm dev
   ```
   Acesse `http://localhost:3000`.

## Integração de Pagamentos (Status)

A base do sistema de faturamento foi estruturada. O banco de dados suporta o modelo de assinaturas e existe uma abstração no código para o provedor de pagamentos. O checkout via Mercado Pago gera a preferência de pagamento corretamente e a rota de webhook recebe os eventos.

**O que falta para produção:** A validação criptográfica da assinatura do webhook do Mercado Pago, a transição de pagamentos avulsos para assinaturas recorrentes reais e tratativas avançadas de retry/idempotência. O fluxo atende bem ao ambiente de desenvolvimento, mas precisa dessas travas de segurança antes de processar transações reais.

## Alguns aprendizados

Construir o motor de geração de horários (slots) foi o maior desafio técnico. Calcular o tempo livre não é só pegar o início e fim do expediente; é preciso considerar a duração variável de cada serviço, subtrair os blocos que já foram agendados, verificar exceções pontuais na agenda e garantir que intervalos sejam respeitados. Abstrair essa complexidade em serviços dedicados dentro de `lib/services/` foi essencial para não sujar a camada de controllers.

Outro ponto interessante foi adotar Server Actions para as mutações de dados. Isso reduziu drasticamente o código repetitivo (boilerplate) que normalmente seria gasto criando rotas de API intermediárias apenas para receber dados de um formulário e repassar para o banco.

## Estrutura principal

- `/app`: Rotas da aplicação (divididas em grupos lógicos como `(auth)`, `(dashboard)`, além do fluxo público de booking).
- `/components`: Componentes React divididos por domínio (interface, dashboard, formulários de booking).
- `/lib`: Camada de regras de negócio (`/services`), queries isoladas (`/repositories`) e integrações externas (`/billing`).
- `/prisma`: Definições do banco de dados.
