import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

export interface CompanyIntel {
  industry: string;
  size_hint: string;
  products_services: string;
  target_market: string;
  tech_stack_hints: string[];
  digital_maturity_hints: string[];
  key_pain_points: string[];
  tone_and_positioning: string;
  summary: string;
}

// Fetches up to MAX_CHARS of visible text from a URL
async function fetchWebsiteText(url: string): Promise<string> {
  const MAX_CHARS = 18000;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MapeIA-Bot/1.0; +https://mapeia.com.br)",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();

  // Strip scripts, styles, SVG, and HTML tags — keep visible text
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return stripped.slice(0, MAX_CHARS);
}

function buildPrompt(url: string, text: string, companyLabel: string): string {
  return `Voce e um analista de inteligencia empresarial especializado em PMEs brasileiras.

Analise o conteudo do site de ${companyLabel} abaixo e extraia informacoes estruturadas para enriquecer um diagnostico de maturidade em IA e automacao.

URL: ${url}

Conteudo do site (texto extraido):
---
${text}
---

Responda EXCLUSIVAMENTE em JSON valido, sem markdown, sem code blocks, com esta estrutura exata:

{
  "industry": "setor principal da empresa (ex: Varejo de Moda, Consultoria de TI, Clinica Odontologica)",
  "size_hint": "estimativa de porte com base nos sinais do site (ex: micro-empresa, PME, empresa media, grande empresa)",
  "products_services": "descricao dos principais produtos ou servicos em 1-2 frases",
  "target_market": "publico-alvo principal da empresa (ex: B2B, B2C, consumidor final, empresas de medio porte)",
  "tech_stack_hints": ["lista de tecnologias ou ferramentas identificadas no site ou nos metadados (ex: Shopify, Salesforce, Google Analytics)"],
  "digital_maturity_hints": ["observacoes sobre o nivel digital da empresa — ex: usa chat online, tem blog ativo, integra WhatsApp, usa pixel de rastreamento, presenca em redes sociais"],
  "key_pain_points": ["possiveis dores ou desafios inferidos com base no tipo de negocio e na comunicacao do site (ex: gestao de estoque, atendimento ao cliente em escala, captacao de leads)"],
  "tone_and_positioning": "como a empresa se posiciona — ex: tradicional e conservadora, moderna e tech-forward, premium e sofisticada, acessivel e popular",
  "summary": "resumo em 2-3 frases sobre o perfil da empresa para uso em um diagnostico de IA — mencione setor, porte estimado, nivel digital percebido e principal oportunidade de melhoria"
}

Regras:
- Se o conteudo for insuficiente para inferir um campo, use null para strings ou [] para arrays
- Nao invente informacoes que nao estejam no conteudo
- Escreva em portugues brasileiro sem acentos
- Retorne APENAS o JSON`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { url, company_name } = await req.json() as { url?: string; company_name?: string };

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalise URL
    let normalised = url.trim();
    if (!normalised.startsWith("http://") && !normalised.startsWith("https://")) {
      normalised = "https://" + normalised;
    }

    // Basic domain validation
    try { new URL(normalised); } catch {
      return new Response(JSON.stringify({ error: "invalid_url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch website text
    const companyLabel = company_name ? `"${company_name}"` : "a empresa";
    let websiteText = "";
    let fetchError = "";
    try {
      websiteText = await fetchWebsiteText(normalised);
    } catch (err) {
      fetchError = String(err);
      console.warn("[scrape-company] fetch failed:", fetchError);
    }

    if (!websiteText || websiteText.length < 100) {
      // Return graceful fallback — don't fail the entire diagnostic
      return new Response(JSON.stringify({
        ok: true,
        intel: null,
        warning: fetchError || "insufficient_content",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ ok: true, intel: null, warning: "ai_not_configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Claude
    const prompt = buildPrompt(normalised, websiteText, companyLabel);
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20250414",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error("[scrape-company] anthropic error", anthropicRes.status, errBody);
      return new Response(JSON.stringify({ ok: true, intel: null, warning: "ai_error" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData?.content?.[0]?.text ?? "";

    let intel: CompanyIntel | null = null;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      intel = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      console.error("[scrape-company] JSON parse failed", rawText.slice(0, 300));
    }

    return new Response(JSON.stringify({ ok: true, intel }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[scrape-company] unexpected", err);
    return new Response(JSON.stringify({ ok: true, intel: null, warning: "unexpected" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
