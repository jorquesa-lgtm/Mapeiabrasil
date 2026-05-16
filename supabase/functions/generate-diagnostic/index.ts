import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

interface CompanyIntel {
  industry?: string | null;
  size_hint?: string | null;
  products_services?: string | null;
  target_market?: string | null;
  tech_stack_hints?: string[];
  digital_maturity_hints?: string[];
  key_pain_points?: string[];
  tone_and_positioning?: string | null;
  summary?: string | null;
}

interface DiagInput {
  sector: string;
  company_size: string;
  revenue: string;
  budget: string;
  answers: Record<string, unknown>;
  answer_labels: Record<string, string>;
  area_scores: Record<string, number>;
  global_score: number;
  maturity_level: number;
  website_url?: string;
  company_name?: string;
  company_intel?: CompanyIntel | null;
  is_premium?: boolean;
  premium_answers?: Record<string, unknown>;
  premium_answer_labels?: Record<string, string>;
}

const AREA_PT: Record<string, string> = {
  infra: "Infraestrutura",
  process: "Processos",
  ai: "IA & Automacao",
  data: "Dados",
  sales: "Vendas",
  service: "Atendimento",
  leadership: "Lideranca",
};

// Benchmarks por setor: media de score global e por area para PMEs brasileiras
const SECTOR_BENCHMARKS: Record<string, { global: number; infra: number; process: number; ai: number; data: number; sales: number; service: number; maturity: number; description: string }> = {
  "Varejo": { global: 38, infra: 42, process: 35, ai: 28, data: 32, sales: 45, service: 38, maturity: 2, description: "O setor de varejo no Brasil esta em transicao digital acelerada, com foco em automacao de vendas e atendimento ao cliente, mas ainda com baixa adocao de IA e analytics avancados." },
  "Servicos": { global: 44, infra: 48, process: 42, ai: 38, data: 40, sales: 50, service: 46, maturity: 2, description: "Empresas de servicos lideram em adocao de ferramentas digitais para atendimento, mas enfrentam gaps em automacao de processos internos e uso estrategico de dados." },
  "Industria": { global: 35, infra: 45, process: 38, ai: 25, data: 30, sales: 32, service: 28, maturity: 2, description: "A industria brasileira avanca na automacao de producao mas ainda tem baixa maturidade em IA aplicada a vendas, dados e atendimento ao cliente." },
  "Saude": { global: 40, infra: 44, process: 36, ai: 32, data: 38, sales: 30, service: 48, maturity: 2, description: "O setor de saude prioriza conformidade e atendimento, com crescente adocao de IA para diagnostico, mas ainda limitada em processos administrativos e dados integrados." },
  "Educacao": { global: 36, infra: 40, process: 32, ai: 30, data: 28, sales: 38, service: 42, maturity: 2, description: "Instituicoes de ensino aceleraram a transformacao digital pos-pandemia, mas ainda enfrentam gaps em personalizacao com IA e automacao de processos academicos." },
  "Financeiro": { global: 58, infra: 62, process: 55, ai: 55, data: 60, sales: 58, service: 54, maturity: 3, description: "O setor financeiro e o mais avancado em IA no Brasil, com fintechs elevando o padrao, mas PMEs financeiras ainda estao atras em implementacao de ML e automacao avancada." },
  "Tecnologia": { global: 62, infra: 68, process: 60, ai: 65, data: 62, sales: 58, service: 56, maturity: 3, description: "Empresas de tecnologia naturalmente lideram na adocao de IA, com foco em automacao de desenvolvimento e dados, mas podem ter gaps em processos de vendas e atendimento escalavel." },
  "Construcao": { global: 28, infra: 35, process: 25, ai: 20, data: 22, sales: 30, service: 26, maturity: 1, description: "A construcao civil tem uma das menores maturidades digitais, com grande oportunidade em automacao de orcamentos, gestao de obras e atendimento ao cliente via IA." },
  "Agronegocio": { global: 32, infra: 38, process: 28, ai: 25, data: 30, sales: 32, service: 24, maturity: 2, description: "O agronegocio avanca em tecnologia de precisao mas ainda tem baixa adocao de IA em gestao administrativa, vendas digitais e atendimento ao cliente." },
  "Logistica": { global: 42, infra: 50, process: 45, ai: 35, data: 38, sales: 36, service: 40, maturity: 2, description: "O setor de logistica investe em rastreamento e roteirizacao, mas ainda tem gaps em previsao de demanda com IA e automacao de atendimento ao cliente." },
};

function getBenchmark(sector: string) {
  // Tenta match exato, depois parcial
  const exact = SECTOR_BENCHMARKS[sector];
  if (exact) return exact;
  const key = Object.keys(SECTOR_BENCHMARKS).find(k => sector.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(sector.toLowerCase()));
  return key ? SECTOR_BENCHMARKS[key] : { global: 40, infra: 42, process: 38, ai: 32, data: 35, sales: 40, service: 38, maturity: 2, description: "PMEs brasileiras estao em media no nivel de transicao digital inicial, com oportunidades significativas em automacao, IA e uso estrategico de dados." };
}

function buildPrompt(input: DiagInput): string {
  const benchmark = getBenchmark(input.sector || "");

  const areaLines = Object.entries(input.area_scores)
    .map(([k, v]) => {
      const bv = benchmark[k as keyof typeof benchmark];
      const diff = typeof bv === "number" ? v - bv : null;
      const diffStr = diff !== null ? (diff >= 0 ? ` (+${diff} vs media do setor)` : ` (${diff} vs media do setor)`) : "";
      return `- ${AREA_PT[k] || k}: ${v}/100${diffStr}`;
    })
    .join("\n");

  const benchmarkLines = Object.entries(AREA_PT)
    .map(([k, label]) => {
      const bv = benchmark[k as keyof typeof benchmark];
      return typeof bv === "number" ? `- ${label}: ${bv}/100` : null;
    })
    .filter(Boolean)
    .join("\n");

  const globalDiff = input.global_score - benchmark.global;
  const globalDiffStr = globalDiff >= 0 ? `+${globalDiff} pontos acima da media` : `${globalDiff} pontos abaixo da media`;

  const answerLines = Object.entries(input.answer_labels)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  // Build premium deep-dive block if available
  let premiumBlock = "";
  if (input.is_premium && input.premium_answer_labels && Object.keys(input.premium_answer_labels).length > 0) {
    const premiumLines = Object.entries(input.premium_answer_labels)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    premiumBlock = `
## Respostas do aprofundamento Premium (15 perguntas condicionais)
${premiumLines}

IMPORTANTE: Use estas respostas para tornar o diagnostico MUITO MAIS PRECISO e personalizado.
- Priorize o processo identificado em ap03_biggest_waste como foco do process_audit.
- Adapte as recomendacoes de automacao com base nas barreiras reveladas em ap06_past_failures e ap07_team_adoption.
- Use o volume de contatos (ap12_contact_volume) e repeticao (ap13_repeat_questions) para calibrar ROI de chatbot.
- Quantifique o custo oculto de horas manuais (ap01_hidden_cost, ap10_report_hours) nos gaps identificados.
- Identifique o dado prioritario que a empresa mais precisa (ap09_missing_data) como primeira recomendacao de dashboard.
- Se ap14_funnel_loss ou ap15_champion_channel indicarem gaps, priorize CRM e atribuicao de marketing no roadmap.
`;
  }

  // Build company intelligence block if available
  let companyIntelBlock = "";
  const ci = input.company_intel;
  if (ci && (ci.summary || ci.products_services)) {
    const techStack = ci.tech_stack_hints?.length ? ci.tech_stack_hints.join(", ") : "nao identificado";
    const digitalHints = ci.digital_maturity_hints?.length ? ci.digital_maturity_hints.join("; ") : "nao identificado";
    const painPoints = ci.key_pain_points?.length ? ci.key_pain_points.join("; ") : "nao identificado";
    companyIntelBlock = `
## Inteligencia da empresa (extraida do site: ${input.website_url || ""})
- Setor identificado: ${ci.industry || "nao identificado"}
- Porte estimado: ${ci.size_hint || "nao identificado"}
- Produtos / Servicos: ${ci.products_services || "nao identificado"}
- Mercado-alvo: ${ci.target_market || "nao identificado"}
- Ferramentas/tecnologias em uso (detectadas): ${techStack}
- Sinais de maturidade digital: ${digitalHints}
- Possiveis dores identificadas: ${painPoints}
- Posicionamento: ${ci.tone_and_positioning || "nao identificado"}
- Resumo: ${ci.summary || "nao disponivel"}

IMPORTANTE: Use estas informacoes para tornar o diagnostico HIPER-PERSONALIZADO.
Mencione o setor especifico, os produtos/servicos reais e as dores identificadas no site.
Se a empresa ja usa certas ferramentas, recomende as proximas que complementem o stack atual.
Adapte a linguagem e os exemplos ao posicionamento e mercado da empresa.`;
  }

  return `Voce e um consultor especializado em transformacao digital para PMEs brasileiras.

Com base nas respostas do diagnostico de maturidade abaixo, gere um relatorio personalizado e comparativo.

## Dados do diagnostico
- Empresa: ${input.company_name || "nao informado"}
- Setor: ${input.sector || "nao informado"}
- Tamanho: ${input.company_size || "nao informado"}
- Faturamento mensal: ${input.revenue || "nao informado"}
- Orcamento mensal para ferramentas: R$${input.budget || "0"}
- Score global: ${input.global_score}/100 (${globalDiffStr} do setor)
- Nivel de maturidade: ${input.maturity_level}/5

## Scores por area (com comparativo vs media do setor)
${areaLines}

## Benchmark do setor "${input.sector || "Geral"}" (media PMEs brasileiras)
- Score global medio: ${benchmark.global}/100
- Nivel de maturidade medio: ${benchmark.maturity}/5
- Contexto do setor: ${benchmark.description}
${benchmarkLines}

## Respostas detalhadas
${answerLines}
${premiumBlock}
${companyIntelBlock}
## Instrucoes
Responda EXCLUSIVAMENTE em JSON valido, sem markdown, sem code blocks, com esta estrutura exata:

{
  "level_title": "titulo do nivel (ex: Em Transicao)",
  "level_description": "1 paragrafo de 3 frases descrevendo o estado atual da empresa de forma especifica ao setor e porte, mencionando explicitamente como ela se posiciona em relacao as outras empresas do setor",
  "benchmark": {
    "sector": "${input.sector || "Geral"}",
    "sector_avg_score": ${benchmark.global},
    "company_score": ${input.global_score},
    "position": "acima | na_media | abaixo",
    "sector_context": "${benchmark.description}",
    "area_comparison": {
      "infra": { "company": ${input.area_scores.infra ?? 0}, "sector_avg": ${benchmark.infra} },
      "process": { "company": ${input.area_scores.process ?? 0}, "sector_avg": ${benchmark.process} },
      "ai": { "company": ${input.area_scores.ai ?? 0}, "sector_avg": ${benchmark.ai} },
      "data": { "company": ${input.area_scores.data ?? 0}, "sector_avg": ${benchmark.data} },
      "sales": { "company": ${input.area_scores.sales ?? 0}, "sector_avg": ${benchmark.sales} },
      "service": { "company": ${input.area_scores.service ?? 0}, "sector_avg": ${benchmark.service} }
    }
  },
  "quick_wins": [
    {
      "title": "titulo curto da acao",
      "description": "2-3 frases explicando o que fazer e por que funciona para este setor",
      "tool": "nome da ferramenta principal",
      "tool_cost": "faixa de custo (ex: Gratuito, R$97/mes)",
      "impact": "resultado esperado em 30 dias",
      "area": "chave da area (infra, process, ai, data, sales, service)"
    }
  ],
  "roadmap": {
    "d30": {
      "title": "titulo da fase 30 dias",
      "subtitle": "frase curta",
      "actions": [
        {
          "title": "titulo da acao",
          "description": "o que fazer concretamente",
          "tool": "ferramenta"
        }
      ]
    },
    "d60": {
      "title": "titulo da fase 60 dias",
      "subtitle": "frase curta",
      "actions": [
        {
          "title": "titulo da acao",
          "description": "o que fazer concretamente",
          "tool": "ferramenta"
        }
      ]
    },
    "d90": {
      "title": "titulo da fase 90 dias",
      "subtitle": "frase curta",
      "actions": [
        {
          "title": "titulo da acao",
          "description": "o que fazer concretamente",
          "tool": "ferramenta"
        }
      ]
    }
  },
  "process_audit": {
    "process_name": "nome do processo mais critico identificado",
    "current_state": "como funciona hoje (2 frases)",
    "automation_potential": "porcentagem de 0 a 100",
    "hours_saved_week": "numero estimado de horas por semana",
    "money_saved_month": "faixa em reais por mes",
    "steps": [
      {
        "label": "etapa do processo",
        "status": "manual | partial | automated",
        "fix": "o que automatizar nesta etapa"
      }
    ]
  },
  "gaps": [
    {
      "area": "chave da area",
      "title": "titulo curto do gap",
      "severity": "critico | importante | moderado",
      "metric": "numero ou fato impactante"
    }
  ]
}

Regras:
- Gere EXATAMENTE 3 quick_wins ordenados por impacto.
- O primeiro quick win deve ser da area com MENOR score.
- Gere EXATAMENTE 3 acoes por fase no roadmap.
- Todas as ferramentas devem caber no orcamento de R$${input.budget || "0"}/mes.
- Se o orcamento e 0, use SOMENTE ferramentas gratuitas.
- Os gaps devem ser de 2 a 4 items.
- O process_audit deve ter 3 steps.
- Nao use acentos, cedilhas ou caracteres especiais alem de pontuacao basica.
- Escreva em portugues brasileiro sem acentos.
- Retorne APENAS o JSON, nada mais.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ai_not_configured", fallback: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const input = (await req.json()) as DiagInput;

    if (
      !input.area_scores ||
      typeof input.global_score !== "number" ||
      typeof input.maturity_level !== "number"
    ) {
      return new Response(
        JSON.stringify({ error: "invalid_input" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const prompt = buildPrompt(input);

    const anthropicRes = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20250414",
          max_tokens: 3000,
          messages: [{ role: "user", content: prompt }],
        }),
      },
    );

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error("[generate-diagnostic] anthropic error", anthropicRes.status, errBody);
      return new Response(
        JSON.stringify({ error: "ai_error", fallback: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const anthropicData = await anthropicRes.json();
    const rawText =
      anthropicData?.content?.[0]?.text ?? "";

    let parsed;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      console.error("[generate-diagnostic] JSON parse failed", rawText.slice(0, 500));
      return new Response(
        JSON.stringify({ error: "ai_parse_error", fallback: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, data: parsed }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[generate-diagnostic] unexpected", err);
    return new Response(
      JSON.stringify({ error: "unexpected", fallback: true }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
