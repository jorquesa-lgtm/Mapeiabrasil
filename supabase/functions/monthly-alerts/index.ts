import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AREA_PT: Record<string, string> = {
  infra: "Infraestrutura",
  process: "Processos",
  ai: "IA & Automacao",
  data: "Dados",
  sales: "Vendas",
  service: "Atendimento",
};

const MATURITY_LABELS = ["", "Inicial", "Em Despertar", "Em Transicao", "Escalavel", "Avancado"];

// Curated tools per sector — used in the "this month's recommendation" section
const TOOLS_BY_SECTOR: Record<string, Array<{ name: string; description: string; cost: string; category: string }>> = {
  geral: [
    { name: "Notion AI", description: "Transforme documentos internos em insights automaticamente com IA integrada ao workspace.", cost: "Gratuito / $10/mes", category: "Produtividade" },
    { name: "Make (Integromat)", description: "Automatize fluxos complexos conectando 1.000+ apps sem escrever codigo.", cost: "Gratuito ate 1.000 operacoes", category: "Automacao" },
    { name: "Gamma AI", description: "Crie apresentacoes e relatorios profissionais em segundos com IA generativa.", cost: "Gratuito / $10/mes", category: "Conteudo" },
  ],
  vendas: [
    { name: "Clay", description: "Enriqueca leads automaticamente com dados de 50+ fontes e personalize abordagens com IA.", cost: "A partir de $149/mes", category: "Prospecao" },
    { name: "Gong", description: "Analise chamadas de vendas com IA para identificar padroes dos melhores closers.", cost: "Sob consulta", category: "Inteligencia de Vendas" },
    { name: "Apollo.io", description: "Plataforma de outreach com sequencias automatizadas e enriquecimento de contatos.", cost: "Gratuito / $49/mes", category: "Outreach" },
  ],
  atendimento: [
    { name: "Intercom Fin AI", description: "Agente de IA que resolve ate 50% dos tickets de suporte autonomamente.", cost: "A partir de $39/mes", category: "Suporte" },
    { name: "Typebot", description: "Chatbots conversacionais com IA para qualificacao de leads no WhatsApp e site.", cost: "Gratuito / $39/mes", category: "Chatbot" },
    { name: "Crisp", description: "Chat ao vivo com IA para qualificar visitantes e responder automaticamente FAQs.", cost: "Gratuito / $25/mes", category: "Chat" },
  ],
  processos: [
    { name: "Zapier", description: "Conecte seus apps e automatize tarefas repetitivas sem codigo.", cost: "Gratuito / $19/mes", category: "Automacao" },
    { name: "Bardeen AI", description: "Automatize tarefas no navegador como extrair dados, preencher formularios e notificar equipes.", cost: "Gratuito / $10/mes", category: "Produtividade" },
    { name: "n8n", description: "Plataforma open-source de automacao com IA para fluxos de trabalho customizados.", cost: "Self-hosted gratuito / $20/mes", category: "Automacao" },
  ],
};

function getTopWeakAreas(areaScores: Record<string, number>, limit = 2): Array<{ key: string; label: string; score: number }> {
  return Object.entries(areaScores)
    .sort(([, a], [, b]) => a - b)
    .slice(0, limit)
    .map(([k, v]) => ({ key: k, label: AREA_PT[k] || k, score: v }));
}

function getToolsForSector(sector: string): typeof TOOLS_BY_SECTOR[string] {
  const s = sector.toLowerCase();
  if (s.includes("venda") || s.includes("comercial")) return TOOLS_BY_SECTOR.vendas;
  if (s.includes("atendimento") || s.includes("suporte") || s.includes("servico")) return TOOLS_BY_SECTOR.atendimento;
  return TOOLS_BY_SECTOR.geral;
}

function scoreColor(score: number): string {
  return score >= 61 ? "#00c896" : score >= 41 ? "#f5c842" : "#ff4055";
}

function buildRediagEmail(data: {
  name: string;
  sector: string;
  lastScore: number;
  maturityLevel: number;
  areaScores: Record<string, number>;
  month: string;
  diagUrl: string;
  dashboardUrl: string;
}): string {
  const { name, sector, lastScore, maturityLevel, areaScores, month, diagUrl, dashboardUrl } = data;
  const sc = scoreColor(lastScore);
  const maturityLabel = MATURITY_LABELS[maturityLevel] || "";
  const weakAreas = getTopWeakAreas(areaScores);
  const tools = getToolsForSector(sector).slice(0, 2);

  const areaBarRows = Object.entries(areaScores)
    .map(([k, v]) => {
      const c = scoreColor(v);
      return `
      <tr>
        <td style="padding:6px 10px;font-size:12px;color:#c8daf0;width:120px;">${AREA_PT[k] || k}</td>
        <td style="padding:6px 10px;">
          <div style="background:#1a3355;border-radius:3px;height:6px;overflow:hidden;">
            <div style="width:${v}%;height:100%;background:${c};border-radius:3px;"></div>
          </div>
        </td>
        <td style="padding:6px 10px;font-size:12px;font-weight:700;color:${c};text-align:right;white-space:nowrap;">${v}/100</td>
      </tr>`;
    }).join("");

  const weakAreaCards = weakAreas.map(a => `
    <div style="flex:1;min-width:140px;padding:14px;background:#102240;border:1px solid #1e3a5f;border-radius:10px;border-top:3px solid ${scoreColor(a.score)};">
      <div style="font-size:10px;color:#4da6ff;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px;">Gap Prioritario</div>
      <div style="font-size:15px;font-weight:700;color:#f4f8ff;margin-bottom:4px;">${a.label}</div>
      <div style="font-size:22px;font-weight:700;color:${scoreColor(a.score)};line-height:1;">${a.score}<span style="font-size:13px;color:#4a6fa0;">/100</span></div>
    </div>`).join("");

  const toolCards = tools.map((t, i) => `
    <div style="margin-bottom:12px;padding:14px;background:#102240;border:1px solid #1e3a5f;border-radius:10px;">
      <div style="font-size:10px;color:#4da6ff;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:5px;">Ferramenta ${i + 1} &middot; ${t.category}</div>
      <div style="font-size:15px;font-weight:700;color:#f4f8ff;margin-bottom:5px;">${t.name}</div>
      <div style="font-size:12px;color:#c8daf0;line-height:1.6;margin-bottom:8px;">${t.description}</div>
      <div style="display:inline-block;background:rgba(0,229,200,.1);border:1px solid rgba(0,229,200,.2);border-radius:6px;padding:3px 10px;font-size:11px;color:#00e5c8;">${t.cost}</div>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Re-diagnostico Mensal MapeIA</title>
</head>
<body style="margin:0;padding:0;background:#040812;font-family:'Segoe UI',Arial,sans-serif;color:#c8daf0;">
<div style="max-width:620px;margin:0 auto;padding:40px 20px 60px;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:36px;padding-bottom:28px;border-bottom:1px solid #1e3a5f;">
    <div style="font-family:Georgia,serif;font-size:24px;color:#f4f8ff;">MapeIA <span style="color:#00e5c8;">Brasil</span></div>
    <div style="font-size:10px;color:#4a6fa0;letter-spacing:.12em;text-transform:uppercase;margin-top:4px;">Acompanhamento Mensal de Maturidade em IA</div>
  </div>

  <!-- Greeting -->
  <div style="margin-bottom:28px;">
    <div style="font-size:20px;font-weight:700;color:#f4f8ff;margin-bottom:10px;">Ola, ${name}!</div>
    <div style="font-size:14px;color:#c8daf0;line-height:1.8;">
      E o momento do seu <strong style="color:#4da6ff;">re-diagnostico mensal</strong>.
      Abaixo esta um resumo do seu ultimo resultado — e um novo diagnostico pode revelar
      quanto voce evoluiu este mes e quais gaps ainda precisam de atencao.
    </div>
  </div>

  <!-- Score snapshot -->
  <div style="background:#0d1d35;border:1px solid #1e3a5f;border-radius:14px;padding:24px;margin-bottom:20px;">
    <div style="font-size:10px;color:#4a6fa0;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">Seu Ultimo Score</div>
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;margin-bottom:20px;">
      <div style="text-align:center;">
        <div style="font-size:56px;font-weight:700;color:${sc};line-height:1;">${lastScore}</div>
        <div style="font-size:11px;color:#4a6fa0;margin-top:2px;">de 100 pontos</div>
      </div>
      <div>
        <div style="display:inline-block;background:${sc}22;border:1px solid ${sc}44;border-radius:99px;padding:5px 16px;font-size:13px;font-weight:700;color:${sc};margin-bottom:6px;">
          Nivel ${maturityLevel}/5 — ${maturityLabel}
        </div>
        <div style="font-size:12px;color:#7a9ec8;">Setor: ${sector}</div>
      </div>
    </div>

    <!-- Area scores -->
    <div style="font-size:10px;color:#4da6ff;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;">Score por Area</div>
    <table style="width:100%;border-collapse:collapse;">${areaBarRows}</table>
  </div>

  <!-- Weak area gaps -->
  ${weakAreas.length ? `
  <div style="margin-bottom:20px;">
    <div style="font-size:10px;color:#ff4055;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px;">Areas que mais precisam de evolucao</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">${weakAreaCards}</div>
  </div>` : ""}

  <!-- CTA: Re-diagnostic -->
  <div style="background:linear-gradient(135deg,#0d2040 0%,#0a1628 100%);border:1px solid #1e3a5f;border-radius:14px;padding:28px;margin-bottom:20px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse 60% 60% at 50% 0%,rgba(0,229,200,.06) 0%,transparent 70%);pointer-events:none;"></div>
    <div style="position:relative;">
      <div style="font-family:Georgia,serif;font-size:20px;color:#f4f8ff;font-weight:400;margin-bottom:8px;">
        Quanto voce evoluiu este mes?
      </div>
      <div style="font-size:13px;color:#7a9ec8;line-height:1.7;margin-bottom:20px;max-width:440px;margin-left:auto;margin-right:auto;">
        Refaca o diagnostico agora (menos de 4 minutos) e compare seu novo score com o anterior.
        Cada mes de trabalho deve refletir em melhorias mensuráveis.
      </div>
      <a href="${diagUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#1a7ff0,#00b8d4);color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px;letter-spacing:.01em;">
        Fazer Re-diagnostico Agora
      </a>
      <div style="margin-top:12px;font-size:11px;color:#4a6fa0;">Leva menos de 4 minutos &middot; Resultado imediato</div>
    </div>
  </div>

  <!-- Tools curation -->
  ${tools.length ? `
  <div style="margin-bottom:20px;">
    <div style="font-size:10px;color:#4da6ff;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">
      Ferramentas Selecionadas Este Mes — ${sector}
    </div>
    ${toolCards}
  </div>` : ""}

  <!-- Dashboard link -->
  <div style="padding:18px;background:#0d1d35;border:1px solid #1e3a5f;border-radius:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:32px;">
    <div style="font-size:13px;color:#c8daf0;">Acesse seu painel para ver seu historico completo de evolucao.</div>
    <a href="${dashboardUrl}" style="display:inline-block;background:rgba(26,127,240,.15);border:1px solid rgba(26,127,240,.3);color:#4da6ff;padding:10px 20px;border-radius:8px;font-weight:700;text-decoration:none;font-size:13px;white-space:nowrap;">
      Abrir Painel
    </a>
  </div>

  <!-- Footer -->
  <div style="text-align:center;font-size:11px;color:#4a6fa0;line-height:2;">
    MapeIA Brasil &mdash; mapeia.com.br<br>
    Voce recebe este email por ter um <strong style="color:#00e5c8;">kit de automacao ativo</strong> na MapeIA.<br>
    Duvidas? <a href="mailto:servicoalcliente@mapeiabrasil.com" style="color:#4a6fa0;text-decoration:underline;">servicoalcliente@mapeiabrasil.com</a>
  </div>

</div>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    const FROM_EMAIL = Deno.env.get("LEAD_FROM_EMAIL") ?? "MapeIA Brasil <servicoalcliente@mapeiabrasil.com>";
    const APP_URL = Deno.env.get("APP_URL") ?? "https://mapeia.com.br";
    const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

    // Authorization: accept either cron secret or service role key
    const authHeader = req.headers.get("Authorization") ?? "";
    const isAuthorized =
      !CRON_SECRET ||
      authHeader.includes(CRON_SECRET) ||
      authHeader.includes(SUPABASE_SERVICE_ROLE_KEY);

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Current month key — e.g. "2026-04" — used for deduplication
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    // Fetch active kit subscribers (re-diagnostic is included with any kit)
    const { data: subs, error: subsErr } = await supabase
      .from("subscriptions")
      .select("user_id, plan, status")
      .like("plan", "kit_%")
      .eq("status", "active");

    if (subsErr) {
      console.error("[monthly-alerts] subscriptions error", subsErr);
      return new Response(JSON.stringify({ error: "db_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: 0, message: "no active subscribers" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user_ids that already received email this month
    const userIds = subs.map(s => s.user_id).filter(Boolean);
    const { data: alreadySent } = await supabase
      .from("monthly_rediag_logs")
      .select("user_id")
      .eq("month_key", monthKey)
      .in("user_id", userIds);

    const alreadySentIds = new Set((alreadySent || []).map((r: { user_id: string }) => r.user_id));

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const sub of subs) {
      if (!sub.user_id || alreadySentIds.has(sub.user_id)) {
        skipped++;
        continue;
      }

      try {
        // Fetch user profile
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("name, email")
          .eq("id", sub.user_id)
          .maybeSingle();

        if (!profile?.email) {
          skipped++;
          continue;
        }

        // Fetch latest report for this user (need area_scores, score, sector, maturity)
        const { data: lastReport } = await supabase
          .from("report_data")
          .select("ai_data, diagnostic_responses(global_score, maturity_level, sector, area_scores)")
          .eq("user_id", sub.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const diag = lastReport?.diagnostic_responses as {
          global_score?: number;
          maturity_level?: number;
          sector?: string;
          area_scores?: Record<string, number>;
        } | null;

        const sector = diag?.sector ?? "Geral";
        const lastScore = diag?.global_score ?? 0;
        const maturityLevel = diag?.maturity_level ?? 1;
        const areaScores = diag?.area_scores ?? {};

        const html = buildRediagEmail({
          name: profile.name || profile.email.split("@")[0],
          sector,
          lastScore,
          maturityLevel,
          areaScores,
          month: monthLabel,
          diagUrl: `${APP_URL}/diagnostico.html`,
          dashboardUrl: `${APP_URL}/painel`,
        });

        let emailOk = false;
        if (RESEND_API_KEY) {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: [profile.email],
              subject: `[MapeIA] Hora do seu re-diagnostico mensal — ${monthLabel}`,
              html,
            }),
          });
          emailOk = res.ok;
          if (!res.ok) {
            const body = await res.text();
            console.error("[monthly-alerts] resend error", profile.email, body);
          }
        } else {
          // No Resend key — count as sent for testing
          emailOk = true;
        }

        if (emailOk) {
          // Log the send to prevent duplicate this month
          await supabase.from("monthly_rediag_logs").insert({
            user_id: sub.user_id,
            email: profile.email,
            month_key: monthKey,
            last_score: lastScore,
            sector,
            sent_at: now.toISOString(),
          });
          sent++;
        } else {
          errors.push(profile.email);
        }
      } catch (err) {
        console.error("[monthly-alerts] error for user", sub.user_id, err);
        errors.push(sub.user_id);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, month: monthKey, sent, skipped, errors: errors.length, total: subs.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[monthly-alerts] unexpected", err);
    return new Response(
      JSON.stringify({ error: "unexpected" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
