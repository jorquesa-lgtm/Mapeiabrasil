export type SetupField = {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "tel" | "select";
  options?: string[];
};

export type AtivarTool = {
  id: string;
  gapArea: string;
  name: string;
  description: string;
  priceMonthly: number;
  status: "active" | "coming_soon";
  setupFields: SetupField[];
  underlyingTools: string[];
};

export const ATIVAR_TOOLS: AtivarTool[] = [
  {
    id: "whatsapp-auto-atendimento",
    gapArea: "service",
    name: "Atendimento Automático no WhatsApp",
    description:
      "Responda clientes 24h automaticamente, qualifique perguntas frequentes e transfira para humanos quando necessário.",
    priceMonthly: 99,
    status: "active",
    setupFields: [
      { key: "whatsapp_number", label: "Número do WhatsApp", placeholder: "+55 11 99999-9999", type: "tel" },
      { key: "business_name", label: "Nome do negócio", placeholder: "Ex: Clínica Saúde Total", type: "text" },
      { key: "main_services", label: "Principais serviços", placeholder: "Ex: Consultas, exames, agendamentos", type: "text" },
      { key: "business_hours", label: "Horário de funcionamento", placeholder: "Ex: Seg–Sex 8h–18h, Sáb 8h–12h", type: "text" },
    ],
    underlyingTools: ["Z-API", "Claude", "Make.com"],
  },
  {
    id: "followup-leads",
    gapArea: "sales",
    name: "Follow-up Automático de Leads",
    description:
      "Nunca perca um lead por falta de resposta. O sistema acompanha cada oportunidade automaticamente até a conversão.",
    priceMonthly: 99,
    status: "active",
    setupFields: [
      { key: "whatsapp_number", label: "Número do WhatsApp", placeholder: "+55 11 99999-9999", type: "tel" },
      { key: "business_name", label: "Nome do negócio", placeholder: "Ex: Construtora Horizonte", type: "text" },
      { key: "product_service", label: "Produto/Serviço vendido", placeholder: "Ex: Apartamentos na planta", type: "text" },
      { key: "avg_response_time", label: "Tempo médio de resposta atual", placeholder: "Ex: 2 horas", type: "text" },
    ],
    underlyingTools: ["Z-API", "Claude", "Make.com"],
  },
  {
    id: "agendamento-inteligente",
    gapArea: "process",
    name: "Agendamento Inteligente",
    description:
      "Automatize marcações de consultas, reuniões e serviços via WhatsApp com sincronização de calendário em tempo real.",
    priceMonthly: 129,
    status: "active",
    setupFields: [
      { key: "business_name", label: "Nome do negócio", placeholder: "Ex: Salão Beleza & Arte", type: "text" },
      { key: "calendar_link", label: "Link do calendário (Google ou Calendly)", placeholder: "https://calendly.com/meu-negocio", type: "text" },
      { key: "service_types", label: "Tipos de serviço", placeholder: "Ex: Corte, escova, coloração", type: "text" },
      { key: "business_hours", label: "Horário de funcionamento", placeholder: "Ex: Ter–Dom 9h–19h", type: "text" },
    ],
    underlyingTools: ["Calendly API", "WhatsApp", "Claude"],
  },
  {
    id: "dashboard-financeiro",
    gapArea: "financial",
    name: "Dashboard Financeiro Automático",
    description:
      "Consolide receitas, despesas e fluxo de caixa em um painel atualizado automaticamente com alertas inteligentes.",
    priceMonthly: 149,
    status: "coming_soon",
    setupFields: [],
    underlyingTools: ["Google Sheets", "Claude", "Email"],
  },
  {
    id: "geracao-propostas",
    gapArea: "process",
    name: "Geração Automática de Propostas",
    description:
      "Crie propostas comerciais profissionais em segundos com dados do cliente e envio automático por e-mail.",
    priceMonthly: 129,
    status: "coming_soon",
    setupFields: [],
    underlyingTools: ["Claude", "PDF generation", "Email"],
  },
  {
    id: "automacao-redes-sociais",
    gapArea: "sales",
    name: "Automação de Redes Sociais",
    description:
      "Publique conteúdo de forma consistente no Instagram e outras redes com geração automática de legendas e imagens.",
    priceMonthly: 99,
    status: "coming_soon",
    setupFields: [],
    underlyingTools: ["Make.com", "Claude", "Instagram API"],
  },
  {
    id: "onboarding-funcionarios",
    gapArea: "process",
    name: "Onboarding Automático de Funcionários",
    description:
      "Integre novos colaboradores com fluxos de tarefas, documentos e treinamentos entregues automaticamente.",
    priceMonthly: 99,
    status: "coming_soon",
    setupFields: [],
    underlyingTools: ["Claude", "Notion", "WhatsApp"],
  },
  {
    id: "pesquisa-satisfacao",
    gapArea: "service",
    name: "Pesquisa de Satisfação Automática",
    description:
      "Colete feedback de clientes via WhatsApp após cada atendimento e visualize métricas de NPS em tempo real.",
    priceMonthly: 79,
    status: "coming_soon",
    setupFields: [],
    underlyingTools: ["Claude", "WhatsApp", "Sheets"],
  },
  {
    id: "alertas-estoque",
    gapArea: "infra",
    name: "Alertas de Estoque Inteligentes",
    description:
      "Receba notificações automáticas quando itens estiverem em falta ou perto do ponto de reposição ideal.",
    priceMonthly: 99,
    status: "coming_soon",
    setupFields: [],
    underlyingTools: ["Google Sheets", "Make.com", "WhatsApp"],
  },
  {
    id: "gestao-contratos",
    gapArea: "process",
    name: "Gestão Automática de Contratos",
    description:
      "Crie, envie, assine e arquive contratos digitalmente com lembretes automáticos de vencimento e renovação.",
    priceMonthly: 129,
    status: "coming_soon",
    setupFields: [],
    underlyingTools: ["Claude", "DocuSign API", "Google Drive"],
  },
];

export function getToolsForGap(gapArea: string): AtivarTool[] {
  return ATIVAR_TOOLS.filter((t) => t.gapArea === gapArea);
}

export function getFirstToolForGap(gapArea: string): AtivarTool | undefined {
  return ATIVAR_TOOLS.find((t) => t.gapArea === gapArea);
}
