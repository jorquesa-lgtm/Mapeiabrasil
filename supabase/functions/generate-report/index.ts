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

function buildRadarSvg(area_scores: Record<string, number>): string {
  const areas = ["infra", "process", "ai", "data", "sales", "service"];
  const labels = ["Infraestrutura", "Processos", "IA & Auto.", "Dados", "Vendas", "Atendimento"];
  const cx = 200, cy = 200, r = 140;
  const n = areas.length;

  // Convert score 0-100 to radius fraction 0-1
  const getPoint = (i: number, value: number): [number, number] => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const frac = value / 100;
    return [
      cx + r * frac * Math.cos(angle),
      cy + r * frac * Math.sin(angle),
    ];
  };

  const gridPoint = (i: number, frac: number): [number, number] => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * frac * Math.cos(angle), cy + r * frac * Math.sin(angle)];
  };

  // Grid rings at 25, 50, 75, 100
  const rings = [0.25, 0.5, 0.75, 1].map(frac => {
    const pts = Array.from({ length: n }, (_, i) => gridPoint(i, frac).join(",")).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="#1e3a5f" stroke-width="${frac === 1 ? 1.5 : 1}" opacity="0.7"/>`;
  }).join("");

  // Axis lines
  const axes = Array.from({ length: n }, (_, i) => {
    const [x, y] = gridPoint(i, 1);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#1e3a5f" stroke-width="1" opacity="0.7"/>`;
  }).join("");

  // Data polygon
  const scores = areas.map(a => area_scores[a] ?? 0);
  const dataPoints = scores.map((v, i) => getPoint(i, v).join(",")).join(" ");
  const avgScore = scores.reduce((a, b) => a + b, 0) / n;
  const fillColor = avgScore >= 61 ? "#00c896" : avgScore >= 41 ? "#f5c842" : "#ff4055";

  const dataPolygon = `<polygon points="${dataPoints}" fill="${fillColor}" fill-opacity="0.15" stroke="${fillColor}" stroke-width="2" stroke-linejoin="round"/>`;

  // Dots at each vertex
  const dots = scores.map((v, i) => {
    const [x, y] = getPoint(i, v);
    const color = v >= 61 ? "#00c896" : v >= 41 ? "#f5c842" : "#ff4055";
    return `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="#040812" stroke-width="1.5"/>`;
  }).join("");

  // Labels and scores
  const labelEls = labels.map((label, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const labelR = r + 28;
    const lx = cx + labelR * Math.cos(angle);
    const ly = cy + labelR * Math.sin(angle);
    const score = scores[i];
    const scoreColor = score >= 61 ? "#00c896" : score >= 41 ? "#f5c842" : "#ff4055";
    const anchor = lx < cx - 5 ? "end" : lx > cx + 5 ? "start" : "middle";
    return `
      <text x="${lx}" y="${ly - 5}" text-anchor="${anchor}" fill="#c8daf0" font-size="11" font-family="'DM Sans',Arial,sans-serif">${label}</text>
      <text x="${lx}" y="${ly + 9}" text-anchor="${anchor}" fill="${scoreColor}" font-size="12" font-weight="700" font-family="'DM Sans',Arial,sans-serif">${score}</text>`;
  }).join("");

  // Ring value labels at top axis
  const ringLabels = [25, 50, 75, 100].map(v => {
    const [, y] = gridPoint(0, v / 100);
    return `<text x="${cx + 4}" y="${y + 4}" fill="#4a6fa0" font-size="9" font-family="'DM Sans',Arial,sans-serif">${v}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" style="display:block;margin:0 auto;max-width:100%;">
  ${rings}
  ${axes}
  ${dataPolygon}
  ${dots}
  ${labelEls}
  ${ringLabels}
</svg>`;
}

function buildReportHtml(data: {
  name: string;
  email: string;
  company: string;
  sector: string;
  global_score: number;
  maturity_level: number;
  area_scores: Record<string, number>;
  ai: Record<string, unknown>;
}): string {
  const { name, company, sector, global_score, maturity_level, area_scores, ai } = data;

  const scoreColor = global_score >= 61 ? "#00c896" : global_score >= 41 ? "#f5c842" : "#ff4055";
  const radarSvg = buildRadarSvg(area_scores);

  const benchmark = (ai.benchmark as Record<string, unknown> | undefined);
  const areaComparison = (benchmark?.area_comparison as Record<string, { company: number; sector_avg: number }> | undefined) || {};

  const areaRows = Object.entries(area_scores)
    .map(([k, v]) => {
      const bar = Math.round(v);
      const color = v >= 61 ? "#00c896" : v >= 41 ? "#f5c842" : "#ff4055";
      const cmp = areaComparison[k];
      const avg = cmp?.sector_avg ?? null;
      const diff = avg !== null ? Math.round(v - avg) : null;
      const diffLabel = diff !== null
        ? `<span style="font-size:11px;color:${diff >= 0 ? "#00c896" : "#ff4055"};margin-left:6px;">${diff >= 0 ? "+" : ""}${diff} vs setor</span>`
        : "";
      return `
        <tr>
          <td style="padding:8px 12px;color:#c8daf0;font-size:13px;">${AREA_PT[k] || k}</td>
          <td style="padding:8px 12px;">
            <div style="background:#1a3355;border-radius:4px;height:8px;overflow:hidden;position:relative;">
              <div style="width:${bar}%;height:100%;background:${color};border-radius:4px;"></div>
              ${avg !== null ? `<div style="position:absolute;top:0;left:${avg}%;width:2px;height:100%;background:#4da6ff;opacity:.7;"></div>` : ""}
            </div>
          </td>
          <td style="padding:8px 12px;color:${color};font-weight:700;font-size:13px;text-align:right;white-space:nowrap;">${bar}/100${diffLabel}</td>
        </tr>`;
    })
    .join("");

  const sectorAvg = (benchmark?.sector_avg_score as number) ?? null;
  const companyScore = (benchmark?.company_score as number) ?? global_score;
  const sectorCtx = (benchmark?.sector_context as string) ?? "";
  const position = (benchmark?.position as string) ?? "";
  const positionColor = position === "acima" ? "#00c896" : position === "abaixo" ? "#ff4055" : "#f5c842";
  const positionLabel = position === "acima" ? "Acima da media do setor" : position === "abaixo" ? "Abaixo da media do setor" : "Na media do setor";

  const benchmarkHtml = sectorAvg !== null ? `
    <div style="margin-top:20px;padding:16px;background:#0a1628;border:1px solid #1a3355;border-radius:10px;">
      <div style="font-size:11px;color:#4da6ff;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px;">Benchmark do Setor</div>
      <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
        <div style="text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#c8daf0;line-height:1;">${sectorAvg}</div>
          <div style="font-size:11px;color:#7a9ec8;margin-top:2px;">Media do setor</div>
        </div>
        <div style="font-size:20px;color:#1e3a5f;">vs</div>
        <div style="text-align:center;">
          <div style="font-size:28px;font-weight:700;color:${positionColor};line-height:1;">${companyScore}</div>
          <div style="font-size:11px;color:#7a9ec8;margin-top:2px;">Sua empresa</div>
        </div>
        <div style="flex:1;">
          <div style="display:inline-block;background:${positionColor}22;border:1px solid ${positionColor}44;border-radius:99px;padding:4px 14px;font-size:12px;font-weight:700;color:${positionColor};">${positionLabel}</div>
        </div>
      </div>
      ${sectorCtx ? `<div style="font-size:12px;color:#7a9ec8;line-height:1.6;">${sectorCtx}</div>` : ""}
      <div style="margin-top:8px;font-size:11px;color:#4a6fa0;">Linha azul nas barras = media do setor</div>
    </div>` : "";

  const qw = (ai.quick_wins as Array<{ title: string; description: string; tool: string; tool_cost: string; impact: string }> || [])
    .map((w, i) => `
      <div style="margin-bottom:16px;padding:16px;background:#102240;border:1px solid #1e3a5f;border-radius:10px;">
        <div style="font-size:11px;color:#4da6ff;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px;">Quick Win ${i + 1}</div>
        <div style="font-size:16px;font-weight:700;color:#f4f8ff;margin-bottom:8px;">${w.title || ""}</div>
        <div style="font-size:13px;color:#c8daf0;line-height:1.6;margin-bottom:8px;">${w.description || ""}</div>
        <div style="display:inline-block;background:rgba(0,229,200,.1);border:1px solid rgba(0,229,200,.2);border-radius:6px;padding:4px 10px;font-size:12px;color:#00e5c8;">
          ${w.tool || ""} &mdash; ${w.tool_cost || ""}
        </div>
        <div style="margin-top:8px;font-size:12px;color:#7a9ec8;"><strong style="color:#c8daf0;">Impacto em 30 dias:</strong> ${w.impact || ""}</div>
      </div>`)
    .join("");

  const roadmap = ai.roadmap as Record<string, { title: string; subtitle: string; actions: Array<{ title: string; description: string; tool: string }> }> || {};
  const phases = ["d30", "d60", "d90"];
  const phaseLabels = ["30 dias", "60 dias", "90 dias"];
  const roadmapHtml = phases.map((p, i) => {
    const ph = roadmap[p];
    if (!ph) return "";
    const acts = (ph.actions || []).map(a => `
        <div style="margin-bottom:10px;padding:12px;background:#0a1628;border-left:3px solid #1a7ff0;border-radius:0 8px 8px 0;">
          <div style="font-size:14px;font-weight:600;color:#e8f2ff;margin-bottom:4px;">${a.title || ""}</div>
          <div style="font-size:12px;color:#7a9ec8;">${a.description || ""}</div>
          ${a.tool ? `<div style="margin-top:6px;font-size:11px;color:#4da6ff;">Ferramenta: ${a.tool}</div>` : ""}
        </div>`).join("");
    return `
      <div style="margin-bottom:20px;">
        <div style="font-size:12px;color:#4da6ff;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;">Fase ${phaseLabels[i]}</div>
        <div style="font-size:17px;font-weight:700;color:#f4f8ff;margin-bottom:4px;">${ph.title || ""}</div>
        <div style="font-size:13px;color:#7a9ec8;margin-bottom:12px;">${ph.subtitle || ""}</div>
        ${acts}
      </div>`;
  }).join("");

  const pa = ai.process_audit as { process_name: string; current_state: string; automation_potential: number; hours_saved_week: number; money_saved_month: string; steps: Array<{ label: string; status: string; fix: string }> } | undefined;
  const paHtml = pa ? `
    <div style="margin-top:28px;">
      <h2 style="font-family:Georgia,serif;font-size:20px;color:#f4f8ff;font-weight:400;margin-bottom:16px;">Auditoria do Processo Critico</h2>
      <div style="background:#102240;border:1px solid #1e3a5f;border-radius:10px;padding:20px;margin-bottom:16px;">
        <div style="font-size:16px;font-weight:700;color:#f4f8ff;margin-bottom:8px;">${pa.process_name || ""}</div>
        <div style="font-size:13px;color:#c8daf0;line-height:1.6;margin-bottom:16px;">${pa.current_state || ""}</div>
        <div style="display:flex;gap:24px;flex-wrap:wrap;">
          <div style="text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#00e5c8;">${pa.automation_potential || 0}%</div>
            <div style="font-size:11px;color:#7a9ec8;margin-top:2px;">Potencial de automacao</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#4da6ff;">${pa.hours_saved_week || 0}h</div>
            <div style="font-size:11px;color:#7a9ec8;margin-top:2px;">Horas salvas/semana</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#f5c842;">R$${pa.money_saved_month || "0"}</div>
            <div style="font-size:11px;color:#7a9ec8;margin-top:2px;">Economia mensal estimada</div>
          </div>
        </div>
      </div>
      ${(pa.steps || []).map(s => {
        const statusColor = s.status === "automated" ? "#00c896" : s.status === "partial" ? "#f5c842" : "#ff4055";
        const statusLabel = s.status === "automated" ? "Automatizado" : s.status === "partial" ? "Parcial" : "Manual";
        return `
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;padding:12px;background:#102240;border:1px solid #1e3a5f;border-radius:8px;">
          <div style="flex-shrink:0;padding:3px 8px;border-radius:4px;background:${statusColor}22;border:1px solid ${statusColor}44;font-size:11px;font-weight:700;color:${statusColor};white-space:nowrap;">${statusLabel}</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:#e8f2ff;">${s.label || ""}</div>
            <div style="font-size:12px;color:#7a9ec8;margin-top:3px;">${s.fix || ""}</div>
          </div>
        </div>`;
      }).join("")}
    </div>` : "";

  const gaps = (ai.gaps as Array<{ area: string; title: string; severity: string; metric: string }> || []);
  const gapsHtml = gaps.length ? `
    <div style="margin-top:28px;">
      <h2 style="font-family:Georgia,serif;font-size:20px;color:#f4f8ff;font-weight:400;margin-bottom:16px;">Gaps Criticos Identificados</h2>
      ${gaps.map(g => {
        const sColor = g.severity === "critico" ? "#ff4055" : g.severity === "importante" ? "#ff8c00" : "#f5c842";
        return `
        <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:10px;padding:14px;background:#102240;border:1px solid #1e3a5f;border-radius:8px;border-left:3px solid ${sColor};">
          <div style="flex-shrink:0;padding:3px 8px;border-radius:4px;background:${sColor}22;font-size:11px;font-weight:700;color:${sColor};text-transform:capitalize;">${g.severity}</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:#e8f2ff;">${AREA_PT[g.area] || g.area} &mdash; ${g.title}</div>
            <div style="font-size:12px;color:#7a9ec8;margin-top:3px;">${g.metric}</div>
          </div>
        </div>`;
      }).join("")}
    </div>` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatorio MapeIA — ${name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#040812;color:#c8daf0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.6;}
  @media print{
    body{background:#fff!important;color:#111!important}
    .no-print{display:none!important}
    .card{background:#f8f9fa!important;border-color:#ddd!important}
  }
</style>
</head>
<body>
<div style="max-width:700px;margin:0 auto;padding:40px 24px 80px;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:40px;padding-bottom:32px;border-bottom:1px solid #1e3a5f;">
    <div style="font-family:Georgia,serif;font-size:28px;color:#f4f8ff;margin-bottom:4px;">MapeIA <span style="color:#00e5c8;">Brasil</span></div>
    <div style="font-size:12px;color:#4a6fa0;letter-spacing:.1em;text-transform:uppercase;">Relatorio de Maturidade em IA</div>
  </div>

  <!-- Identity -->
  <div style="background:#0d1d35;border:1px solid #1e3a5f;border-radius:14px;padding:24px;margin-bottom:28px;">
    <div style="font-size:11px;color:#4da6ff;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px;">Empresa Analisada</div>
    <div style="font-size:20px;font-weight:700;color:#f4f8ff;margin-bottom:4px;">${company || name}</div>
    <div style="font-size:13px;color:#7a9ec8;">Setor: ${sector} &nbsp;&middot;&nbsp; Gerado em: ${new Date().toLocaleDateString("pt-BR")}</div>
  </div>

  <!-- Score -->
  <div style="background:#0d1d35;border:1px solid #1e3a5f;border-radius:14px;padding:28px;margin-bottom:28px;text-align:center;">
    <div style="font-size:11px;color:#7a9ec8;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px;">Score Global de Maturidade</div>
    <div style="font-size:72px;font-weight:700;color:${scoreColor};line-height:1;">${global_score}</div>
    <div style="font-size:13px;color:#7a9ec8;margin-top:4px;">de 100 pontos</div>
    <div style="display:inline-block;margin-top:14px;background:${scoreColor}22;border:1px solid ${scoreColor}44;border-radius:99px;padding:6px 20px;font-size:14px;font-weight:700;color:${scoreColor};">
      Nivel ${maturity_level}/5 — ${MATURITY_LABELS[maturity_level] || ""}
    </div>
    ${ai.level_description ? `<p style="margin-top:16px;font-size:14px;color:#c8daf0;line-height:1.65;max-width:500px;margin-left:auto;margin-right:auto;">${ai.level_description}</p>` : ""}
  </div>

  <!-- Radar Chart -->
  <div style="background:#0d1d35;border:1px solid #1e3a5f;border-radius:14px;padding:24px;margin-bottom:28px;">
    <div style="font-size:11px;color:#4da6ff;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:16px;">Visao Geral por Area</div>
    ${radarSvg}
  </div>

  <!-- Area scores + benchmark -->
  <div style="background:#0d1d35;border:1px solid #1e3a5f;border-radius:14px;padding:24px;margin-bottom:28px;">
    <div style="font-size:11px;color:#4da6ff;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:16px;">Score por Area vs Media do Setor</div>
    <table style="width:100%;border-collapse:collapse;">
      ${areaRows}
    </table>
    ${benchmarkHtml}
  </div>

  <!-- Quick wins -->
  <div style="margin-bottom:28px;">
    <h2 style="font-family:Georgia,serif;font-size:20px;color:#f4f8ff;font-weight:400;margin-bottom:16px;">Quick Wins Priorizados</h2>
    ${qw || "<p style='color:#7a9ec8;'>Nao disponivel.</p>"}
  </div>

  <!-- Roadmap -->
  <div style="background:#0d1d35;border:1px solid #1e3a5f;border-radius:14px;padding:24px;margin-bottom:28px;">
    <h2 style="font-family:Georgia,serif;font-size:20px;color:#f4f8ff;font-weight:400;margin-bottom:20px;">Roadmap 30/60/90 Dias</h2>
    ${roadmapHtml || "<p style='color:#7a9ec8;'>Nao disponivel.</p>"}
  </div>

  ${paHtml}
  ${gapsHtml}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:24px;border-top:1px solid #1e3a5f;text-align:center;font-size:12px;color:#4a6fa0;">
    <div>Relatorio gerado por MapeIA Brasil &mdash; mapeia.com.br</div>
    <div style="margin-top:4px;">Este relatorio e confidencial e foi gerado exclusivamente para ${name}.</div>
  </div>

</div>
</body>
</html>`;
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    const FROM_EMAIL = Deno.env.get("LEAD_FROM_EMAIL") ?? "MapeIA Brasil <no-reply@mapeia.com.br>";

    const body = await req.json().catch(() => ({}));
    const {
      diag_id,
      user_id,
      stripe_session_id,
      email,
      name,
      company,
      sector,
      global_score,
      maturity_level,
      area_scores,
      ai_data,
    } = body;

    if (!email || !ai_data) {
      return new Response(JSON.stringify({ error: "missing_required_fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Store report data
    const { data: report, error: insertError } = await supabase
      .from("report_data")
      .insert({
        diag_id: diag_id || null,
        user_id: user_id || null,
        email,
        stripe_session_id: stripe_session_id || "",
        ai_data,
        pdf_sent: false,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      console.error("[generate-report] insert error", insertError);
    }

    // Auto-populate user_goals from the 30/60/90 roadmap (if user is authenticated)
    if (user_id && diag_id && ai_data?.roadmap) {
      const AREA_MAP: Record<string, string> = {
        infra: "infra", process: "process", ai: "ai",
        data: "data", sales: "sales", service: "service",
      };
      const phaseMap: Array<{ key: string; prazo: string; source: string }> = [
        { key: "d30", prazo: "30 dias", source: "roadmap_30" },
        { key: "d60", prazo: "60 dias", source: "roadmap_60" },
        { key: "d90", prazo: "90 dias", source: "roadmap_90" },
      ];
      const goalsToInsert: Array<Record<string, unknown>> = [];
      for (const phase of phaseMap) {
        const ph = (ai_data.roadmap as Record<string, { actions?: Array<{ title: string; area?: string }> }>)[phase.key];
        if (!ph?.actions) continue;
        for (const action of ph.actions) {
          const rawArea = (action.area || "").toLowerCase();
          const category = AREA_MAP[rawArea] || "geral";
          goalsToInsert.push({
            user_id,
            title: action.title || "",
            description: `Fase ${phase.prazo} — gerado automaticamente pelo diagnóstico`,
            category,
            priority: phase.key === "d30" ? "alta" : phase.key === "d60" ? "media" : "baixa",
            source: phase.source,
            source_diag_id: diag_id,
          });
        }
      }
      if (goalsToInsert.length > 0) {
        const { error: goalsErr } = await supabase.from("user_goals").insert(goalsToInsert);
        if (goalsErr) console.error("[generate-report] goals insert error", goalsErr);
      }
    }

    // Build HTML report
    const reportHtml = buildReportHtml({
      name: name || email,
      email,
      company: company || "",
      sector: sector || "",
      global_score: global_score || 0,
      maturity_level: maturity_level || 1,
      area_scores: area_scores || {},
      ai: ai_data,
    });

    // Send via Resend as HTML email (print-to-PDF quality)
    let emailSent = false;
    if (RESEND_API_KEY) {
      const emailPayload = {
        from: FROM_EMAIL,
        to: [email],
        subject: `Seu Relatorio MapeIA — ${name || email}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#040812;color:#c8daf0;padding:32px 24px;border-radius:12px;">
            <h1 style="font-size:22px;color:#f4f8ff;margin-bottom:8px;">Seu relatorio esta pronto!</h1>
            <p style="color:#7a9ec8;margin-bottom:24px;">Ola ${name || ""},</p>
            <p style="color:#c8daf0;margin-bottom:16px;">
              Seu Relatorio Completo de Maturidade em IA esta disponivel no seu painel.
              Clique no botao abaixo para acessar — seu e-mail ja estara preenchido.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="https://mapeaibrasil.com/painel.html?email=${encodeURIComponent(email)}"
                 style="background:linear-gradient(135deg,#1a7ff0,#00b8d4);color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px;">
                Acessar Meu Relatorio
              </a>
            </div>
            <p style="font-size:12px;color:#4a6fa0;margin-top:24px;text-align:center;">
              MapeIA Brasil &mdash; mapeaibrasil.com<br>
              Duvidas? <a href="mailto:contato@mapeaibrasil.com" style="color:#7a9ec8;">contato@mapeaibrasil.com</a>
            </p>
          </div>`,
      };

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailPayload),
      });

      emailSent = resendRes.ok;

      if (emailSent && report?.id) {
        await supabase
          .from("report_data")
          .update({ pdf_sent: true, pdf_sent_at: new Date().toISOString() })
          .eq("id", report.id);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, report_id: report?.id, email_sent: emailSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[generate-report] unexpected", err);
    return new Response(
      JSON.stringify({ error: "unexpected" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
