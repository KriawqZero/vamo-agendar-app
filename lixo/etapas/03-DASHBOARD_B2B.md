# Etapa 3 - Área Administrativa (B2B Dashboard)

Este documento detalha o desenvolvimento do painel administrativo voltado para os profissionais cadastrados (B2B), abrangendo roteamento, gerenciamento de estado e recursos de controle do negócio.

---

## 📂 Organização das Páginas e Estrutura de Rotas

O painel administrativo está encapsulado no grupo `/dashboard` do Next.js App Router, garantindo que toda a navegação compartilhe o mesmo layout base e validação de sessão.

```
src/app/dashboard/
├── layout.tsx              # Sidebar de navegação principal e Clerk Organization Switcher
├── page.tsx                # Dashboard principal (Server Component para busca de dados)
├── DashboardClient.tsx     # Gerenciamento de estado, listagem de agendamentos e estatísticas
├── servicos/
│   ├── page.tsx            # Página de serviços (Server Component)
│   └── ServicosClient.tsx  # Tabela de serviços, cadastro e edições via slideover
├── agenda/
│   ├── page.tsx            # Página de agenda e perfil (Server Component)
│   └── AgendaClient.tsx    # Configuração de horários, bloqueios e dados públicos
└── whatsapp/
    ├── page.tsx            # Página do WhatsApp (Server Component)
    └── WhatsappClient.tsx  # Polling de QR Code, pareamento e edição de templates
```

---

## 🎨 Design System e Estética Premium

Para garantir um visual limpo e extremamente profissional que impressione à primeira vista (Wow Factor), adotamos:
*   **Palette de Cores Tailored**: Tons neutros e frios da escala `zinc` com contrastes sutis em branco e preto profundo, enriquecidos por acentos dinâmicos em cores suaves (como `emerald` para status "Concluído" e `red` para "Cancelado").
*   **Fontes e Tipografia**: Uso da fonte **Inter** com hierarquia estrita de pesos, garantindo excelente legibilidade.
*   **Layout Fluid/Responsivo**: Design Mobile-First adaptável que se expande elegantemente em telas desktop usando grids flexíveis e drawers suspensos.

---

## ⚙️ Principais Funcionalidades

### 1. Painel Principal (Agendamentos)
*   **Métricas Financeiras**: Exibe o faturamento diário estimado (soma dos valores dos serviços dos agendamentos confirmados e concluídos) e a quantidade de reservas.
*   **Seletor de Datas**: Atualiza as informações via Query Params (`?date=YYYY-MM-DD`), fazendo o Next.js re-renderizar a página com os dados corretos no servidor de forma veloz.
*   **Gestão de Status**: Botões rápidos nas linhas da tabela executam Server Actions de alteração de status (`concluido` ou `cancelado`) atualizando a UI instantaneamente através de transições suaves do React 19.

### 2. Gestão de Serviços
*   **Slideover Modal**: Drawer animado que desliza pela lateral para adicionar ou atualizar dados de serviços, evitando transições pesadas de páginas.
*   **Toggle de Atividade**: Permite desativar temporariamente um serviço com um único clique. Um serviço desativado deixa de aparecer na página pública `/book/[slug]` sem excluir seu histórico.

### 3. Agenda, Exceções e Perfil
*   **Dados da Loja**: Modifica o nome de exibição pública e a slug do negócio. O sistema valida no backend a exclusividade da slug escolhida.
*   **Configuração de Janela Padrão**: Define os horários comerciais de abertura e fechamento para cada um dos 7 dias da semana.
*   **Bloqueios de Agenda (Feriados/Ausências)**: Formulário para inserir datas completas ou períodos bloqueados. A engine de agendamento lê instantaneamente estas exceções para remover a exibição de horários públicos.

### 4. Controle de WhatsApp
*   **Polling de Conectividade**: Caso a instância esteja offline, o cliente executa requisições de 5 em 5 segundos no backend buscando o QR Code em base64 da Evolution API para pareamento imediato.
*   **Edição de Templates**: Área para o profissional personalizar as mensagens automáticas usando variáveis dinâmicas (ex: `{{cliente}}`, `{{empresa}}`, `{{data_hora}}`).
