import { useEffect, useState, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { LogOut, FileText, Star, Clock, ChevronRight, Download, RefreshCw, Target, Plus, Trash2, Check, Calendar, Flag, Eye, X } from "lucide-react";
import AtivarSection from "../components/ativar/AtivarSection";

interface UserProfile {
  name: string;
  email: string;
  company: string;
  plan_tier: string;
}

interface Subscription {
  plan: string;
  status: string;
  current_period_end: string | null;
  created_at: string;
}

interface ReportItem {
  id: string;
  created_at: string;
  stripe_session_id: string;
  pdf_sent: boolean;
  // present when sourced from report_data
  ai_data: {
    level_title?: string;
    level_description?: string;
    quick_wins?: Array<{ title: string; description?: string; tool?: string; tool_url?: string }>;
    benchmark?: { sector_avg_score?: number; company_score?: number; position?: string; sector_context?: string };
    roadmap?: Record<string, { title: string; subtitle?: string; actions?: Array<{ title: string; description?: string; tool?: string; area?: string }> }>;
    process_audit?: { process_name?: string; current_state?: string; automation_potential?: number; hours_saved_week?: number; money_saved_month?: string };
    gaps?: Array<{ area?: string; title: string; severity: string; metric?: string }>;
  };
  // present when joined from report_data -> diagnostic_responses
  diagnostic_responses?: {
    global_score: number;
    maturity_level: number;
    sector: string;
    area_scores: Record<string, number>;
  };
  // present when sourced directly from diagnostic_responses
  _fromDiag?: boolean;
  global_score?: number;
  maturity_level?: number;
  sector?: string;
  area_scores?: Record<string, number>;
}

const AREA_PT: Record<string, string> = {
  infra: "Infraestrutura",
  process: "Processos",
  ai: "IA & Automação",
  data: "Dados",
  sales: "Vendas",
  service: "Atendimento",
};

const MATURITY = ["", "Inicial", "Em Despertar", "Em Transição", "Escalável", "Avançado"];

export default function DashboardPage({ user }: { user: User }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"relatorios" | "metas" | "playbooks">("relatorios");
  const [viewingReport, setViewingReport] = useState<ReportItem | null>(null);

  async function loadData(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    // Retroactively stamp user_id on rows saved anonymously during the diagnostic.
    // Idempotent — once claimed the UPDATE is a no-op on subsequent loads.
    await supabase.rpc("claim_my_diagnostics").catch(() => {});

    const [profileRes, subRes, reportsByUid, diagsByUid] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Primary: report_data linked by user_id (premium reports with full ai_data)
      supabase
        .from("report_data")
        .select("*, diagnostic_responses(global_score, maturity_level, sector, area_scores)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      // Primary: diagnostic_responses linked by user_id (all diagnostics, free + premium)
      supabase
        .from("diagnostic_responses")
        .select("id, created_at, global_score, maturity_level, sector, area_scores, ai_data, plan_tier, stripe_session_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    setProfile(profileRes.data as UserProfile | null);
    setSubscription(subRes.data as Subscription | null);

    // Merge report_data (has full ai_data) and diagnostic_responses (has score/area data).
    // report_data rows are preferred because they contain the generated AI report.
    // diagnostic_responses rows fill the gap for free diagnostics and premium ones
    // that haven't had report_data written yet.
    const reportRows: ReportItem[] = (reportsByUid.data ?? []) as ReportItem[];
    const diagRows = (diagsByUid.data ?? []) as Array<{
      id: string; created_at: string; global_score: number; maturity_level: number;
      sector: string; area_scores: Record<string, number>; ai_data: ReportItem["ai_data"];
      plan_tier: string; stripe_session_id: string;
    }>;

    // Build a set of diag_ids already represented by report_data rows
    // reportRows have a diag_id FK stored in the joined diagnostic_responses id
    const coveredDiagIds = new Set(
      reportRows
        .map((r) => (r as unknown as { diag_id?: string }).diag_id)
        .filter(Boolean) as string[]
    );
    // Also track by stripe_session_id to avoid duplication
    const coveredSessions = new Set(reportRows.map((r) => r.stripe_session_id).filter(Boolean));

    // Convert diagnostic_responses rows into ReportItem shape for display
    const diagAsReports: ReportItem[] = diagRows
      .filter((d) => !coveredDiagIds.has(d.id) && !coveredSessions.has(d.stripe_session_id))
      .map((d) => ({
        id: d.id,
        created_at: d.created_at,
        stripe_session_id: d.stripe_session_id || "",
        pdf_sent: false,
        ai_data: d.ai_data || {},
        _fromDiag: true,
        global_score: d.global_score,
        maturity_level: d.maturity_level,
        sector: d.sector,
        area_scores: d.area_scores,
      }));

    let merged = [...reportRows, ...diagAsReports].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Fallback: if the claim RPC didn't find anything (e.g. first login before the
    // migration ran), also query by email directly — covers both report_data (paid)
    // and diagnostic_responses (free) so no user ever sees an empty dashboard.
    if (!merged.length) {
      const [emailReports, emailDiags] = await Promise.all([
        supabase
          .from("report_data")
          .select("*, diagnostic_responses(global_score, maturity_level, sector, area_scores)")
          .eq("email", user.email ?? "")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("diagnostic_responses")
          .select("id, created_at, global_score, maturity_level, sector, area_scores, ai_data, plan_tier, stripe_session_id")
          .eq("email", user.email ?? "")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const reportsByEmail: ReportItem[] = (emailReports.data as ReportItem[]) || [];
      const coveredByEmail = new Set(
        reportsByEmail
          .map((r) => (r as unknown as { diag_id?: string }).diag_id)
          .filter(Boolean) as string[]
      );

      const diagsByEmail: ReportItem[] = (
        (emailDiags.data as Array<{
          id: string; created_at: string; global_score: number; maturity_level: number;
          sector: string; area_scores: Record<string, number>; ai_data: ReportItem["ai_data"];
          plan_tier: string; stripe_session_id: string;
        }>) || []
      )
        .filter((d) => !coveredByEmail.has(d.id))
        .map((d) => ({
          id: d.id,
          created_at: d.created_at,
          stripe_session_id: d.stripe_session_id || "",
          pdf_sent: false,
          ai_data: d.ai_data || {},
          _fromDiag: true,
          global_score: d.global_score,
          maturity_level: d.maturity_level,
          sector: d.sector,
          area_scores: d.area_scores,
        }));

      merged = [...reportsByEmail, ...diagsByEmail].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    setReports(merged);
    if (merged.length) setSelectedReport(merged[0]);

    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { loadData(); }, [user.id]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  function handleDownloadPdf() {
    if (!selectedReport) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(buildPrintHtml(selectedReport, profile));
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  function handleViewReport() {
    if (selectedReport) setViewingReport(selectedReport);
  }

  const isEvolucao = subscription?.plan === "subscription" && subscription?.status === "active";
  const isPremium = !!subscription && subscription.status === "active";

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#040812", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 40, height: 40, border: "2px solid #1e3a5f", borderTopColor: "#00e5c8", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#040812", fontFamily: "'DM Sans', sans-serif", color: "#c8daf0" }}>
      {viewingReport && (
        <ReportViewerModal
          report={viewingReport}
          profile={profile}
          onClose={() => setViewingReport(null)}
        />
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .fade-in { animation: fadeIn .3s ease; }
        .report-row:hover { background: #102240 !important; cursor: pointer; }
        .btn-hover:hover { transform: translateY(-2px); box-shadow: 0 14px 40px rgba(26,127,240,.4) !important; }
        .ghost-hover:hover { border-color: #4a6fa0 !important; color: #e8f2ff !important; }
      `}</style>

      {/* Topnav */}
      <nav style={{ padding: "16px 32px", borderBottom: "1px solid #1e3a5f", background: "#060c1a", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <a href="/diagnostico.html" style={{ fontFamily: "Georgia, serif", fontSize: 22, color: "#f4f8ff", textDecoration: "none" }}>
          MapeIA <span style={{ color: "#00e5c8" }}>Brasil</span>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {isPremium && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: isEvolucao ? "rgba(0,229,200,.1)" : "rgba(26,127,240,.1)", border: `1px solid ${isEvolucao ? "rgba(0,229,200,.25)" : "rgba(26,127,240,.25)"}`, borderRadius: 99, padding: "4px 12px", fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: isEvolucao ? "#00e5c8" : "#4da6ff" }}>
              <Star size={11} />
              {isEvolucao ? "Evolução" : "Premium"}
            </div>
          )}
          <span style={{ fontSize: 13, color: "#7a9ec8" }}>{profile?.name || user.email}</span>
          <button onClick={handleSignOut} style={{ background: "none", border: "1px solid #1e3a5f", borderRadius: 8, padding: "6px 12px", color: "#7a9ec8", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontFamily: "inherit" }}>
            <LogOut size={14} /> Sair
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Welcome */}
        <div className="fade-in" style={{ marginBottom: 36 }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(24px,3vw,36px)", color: "#f4f8ff", fontWeight: 400, marginBottom: 6 }}>
            Olá, <em style={{ color: "#00e5c8", fontStyle: "italic" }}>{(profile?.name || user.email || "").split(" ")[0]}</em>
          </h1>
          <p style={{ fontSize: 15, color: "#7a9ec8" }}>
            {reports.length
              ? `Você tem ${reports.length} relatório${reports.length > 1 ? "s" : ""} disponível${reports.length > 1 ? "s" : ""}.`
              : "Nenhum relatório encontrado. Complete um diagnóstico para começar."}
          </p>
        </div>

        {/* Plan card + actions */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 36 }}>
          <PlanCard subscription={subscription} isPremium={isPremium} isEvolucao={isEvolucao} />
          <ActionCard onRefresh={() => loadData(true)} refreshing={refreshing} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid #1e3a5f", paddingBottom: 0 }}>
          {(["relatorios", "metas", "playbooks"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{ background: "none", border: "none", borderBottom: activeTab === tab ? "2px solid #1a7ff0" : "2px solid transparent", padding: "10px 20px", color: activeTab === tab ? "#f4f8ff" : "#4a6fa0", fontSize: 14, fontWeight: activeTab === tab ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all .15s", marginBottom: -1 }}
            >
              {tab === "relatorios" ? "Meus Relatórios" : tab === "metas" ? "Metas & Checklist" : "Biblioteca de Playbooks"}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === "playbooks" ? (
          <PlaybooksSection sector={reports[0]?._fromDiag ? reports[0]?.sector : reports[0]?.diagnostic_responses?.sector} isPremium={isPremium} />
        ) : activeTab === "metas" ? (
          <GoalsSection userId={user.id} latestReport={reports[0] ?? null} />
        ) : reports.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>
            {/* Report list */}
            <div style={{ background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e3a5f", fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase" }}>
                Relatórios ({reports.length})
              </div>
              {reports.map((r) => {
                const score = r._fromDiag ? (r.global_score ?? 0) : (r.diagnostic_responses?.global_score ?? 0);
                const sectorLabel = r._fromDiag ? (r.sector || "Diagnóstico") : (r.diagnostic_responses?.sector || "Diagnóstico");
                const scoreColor = score >= 61 ? "#00c896" : score >= 41 ? "#f5c842" : "#ff4055";
                const isSelected = selectedReport?.id === r.id;
                return (
                  <div
                    key={r.id}
                    className="report-row"
                    onClick={() => setSelectedReport(r)}
                    style={{
                      padding: "14px 20px",
                      borderBottom: "1px solid #1a3355",
                      background: isSelected ? "#102240" : "transparent",
                      transition: "background .15s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#e8f2ff", marginBottom: 3 }}>
                        {sectorLabel}
                      </div>
                      <div style={{ fontSize: 11, color: "#4a6fa0" }}>
                        {new Date(r.created_at).toLocaleDateString("pt-BR")}
                        {r._fromDiag && <span style={{ marginLeft: 6, fontSize: 10, color: "#2a4a6f", background: "#0d1d35", border: "1px solid #1a3355", borderRadius: 4, padding: "1px 5px" }}>Grátis</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor }}>{score}</span>
                      <ChevronRight size={14} color={isSelected ? "#4da6ff" : "#1e3a5f"} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Report detail */}
            {selectedReport && (
              <ReportDetail
                report={selectedReport}
                onDownload={handleDownloadPdf}
                onView={handleViewReport}
                isEvolucao={isEvolucao}
                isPremium={isPremium}
                allReports={reports}
                userId={user.id}
                userEmail={user.email ?? ""}
                clientName={profile?.name ?? ""}
              />
            )}
          </div>
        )}

        {/* Evolucao upsell */}
        {!isEvolucao && (
          <EvolucaoUpsell userEmail={user.email ?? ""} />
        )}

        {/* Contact footer */}
        <div style={{ marginTop: 48, borderTop: "1px solid #1e3a5f", paddingTop: 32, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>Precisa de ajuda?</div>
            <div style={{ fontSize: 14, color: "#7a9ec8" }}>Nossa equipe está pronta para te atender.</div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a
              href="mailto:servicoaocliente@mapeiabrasil.com"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, color: "#c8daf0", textDecoration: "none", transition: "all .2s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#4da6ff"; (e.currentTarget as HTMLAnchorElement).style.color = "#4da6ff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#1e3a5f"; (e.currentTarget as HTMLAnchorElement).style.color = "#c8daf0"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              servicoaocliente@mapeiabrasil.com
            </a>
            <a
              href="https://wa.me/5512996790859"
              target="_blank"
              rel="noopener"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, color: "#c8daf0", textDecoration: "none", transition: "all .2s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#00c896"; (e.currentTarget as HTMLAnchorElement).style.color = "#00c896"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#1e3a5f"; (e.currentTarget as HTMLAnchorElement).style.color = "#c8daf0"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function PlanCard({ subscription, isPremium, isEvolucao }: { subscription: Subscription | null; isPremium: boolean; isEvolucao: boolean }) {
  const label = isEvolucao ? "Evolução" : isPremium ? "Premium" : "Gratuito";
  const color = isEvolucao ? "#00e5c8" : isPremium ? "#4da6ff" : "#7a9ec8";
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("pt-BR")
    : null;

  return (
    <div style={{ background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 14, padding: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Seu Plano</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginBottom: 6 }}>{label}</div>
      {periodEnd && (
        <div style={{ fontSize: 12, color: "#4a6fa0", display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={12} /> Renovação em {periodEnd}
        </div>
      )}
      {isEvolucao && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {["Relatórios ilimitados", "Histórico completo", "Suporte prioritário", "Novas funcionalidades"].map(f => (
            <div key={f} style={{ fontSize: 12, color: "#7a9ec8", display: "flex", alignItems: "center", gap: 6 }}>
              <Check size={13} strokeWidth={2} style={{ color: "#00e5c8", flexShrink: 0 }} /> {f}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <div style={{ background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 14, padding: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Ações Rápidas</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <a
          href="/diagnostico.html"
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(26,127,240,.1)", border: "1px solid rgba(26,127,240,.2)", borderRadius: 10, color: "#4da6ff", textDecoration: "none", fontSize: 14, fontWeight: 600, transition: "all .2s" }}
        >
          <FileText size={16} /> Novo diagnóstico
        </a>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "transparent", border: "1px solid #1e3a5f", borderRadius: 10, color: "#7a9ec8", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .2s", opacity: refreshing ? 0.6 : 1 }}
        >
          <RefreshCw size={16} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          {refreshing ? "Atualizando..." : "Atualizar relatórios"}
        </button>
      </div>
    </div>
  );
}

function ReportDetail({ report, onDownload, onView, isEvolucao, isPremium, allReports, userId, userEmail, clientName }: { report: ReportItem; onDownload: () => void; onView: () => void; isEvolucao: boolean; isPremium?: boolean; allReports: ReportItem[]; userId?: string; userEmail?: string; clientName?: string }) {
  const ai = report.ai_data || {};
  // Normalise: _fromDiag items have score data flat on the item; joined items nest it under diagnostic_responses
  const diag = report._fromDiag
    ? { global_score: report.global_score ?? 0, maturity_level: report.maturity_level ?? 0, sector: report.sector ?? "", area_scores: report.area_scores ?? {} }
    : report.diagnostic_responses;
  const score = diag?.global_score ?? 0;
  const scoreColor = score >= 61 ? "#00c896" : score >= 41 ? "#f5c842" : "#ff4055";
  const maturity = MATURITY[diag?.maturity_level ?? 0] || "";

  // Derive top 3 gap areas (lowest scores first) for AtivarSection
  const topGaps: string[] = diag?.area_scores
    ? Object.entries(diag.area_scores)
        .sort(([, a], [, b]) => a - b)
        .slice(0, 3)
        .map(([k]) => k)
    : [];

  return (
    <div className="fade-in" style={{ background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 14, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e3a5f", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "#4a6fa0", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>
            {diag?.sector || "Diagnóstico"} &middot; {new Date(report.created_at).toLocaleDateString("pt-BR")}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f4f8ff" }}>
            {(ai as { level_title?: string }).level_title || `Nível ${diag?.maturity_level ?? ""}`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 11, color: "#4a6fa0", marginTop: 2 }}>{maturity}</div>
          </div>
          <button
            onClick={onView}
            className="btn-hover"
            style={{ display: "flex", alignItems: "center", gap: 8, background: "#102240", border: "1px solid #1e3a5f", borderRadius: 10, padding: "10px 18px", color: "#c8daf0", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}
          >
            <Eye size={14} /> Ver relatório
          </button>
          <button
            onClick={onDownload}
            className="btn-hover"
            style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#1a7ff0,#00b8d4)", border: "none", borderRadius: 10, padding: "10px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .2s", boxShadow: "0 8px 24px rgba(26,127,240,.25)" }}
          >
            <Download size={14} /> Baixar PDF
          </button>
        </div>
      </div>

      <div style={{ padding: "24px" }}>
        {/* Score evolution chart — Evolucao feature */}
        <ScoreEvolutionChart reports={allReports} isEvolucao={isEvolucao} />

        {/* Description */}
        {(ai as { level_description?: string }).level_description && (
          <p style={{ fontSize: 14, color: "#c8daf0", lineHeight: 1.7, marginBottom: 24, padding: "16px", background: "#102240", borderRadius: 10, borderLeft: "3px solid #1a7ff0" }}>
            {(ai as { level_description?: string }).level_description}
          </p>
        )}

        {diag?.area_scores ? (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>
              Score por Área
              {Boolean((ai as { benchmark?: unknown }).benchmark) && <span style={{ marginLeft: 8, fontSize: 10, color: "#1e3a5f", fontWeight: 400 }}>— linha pontilhada = média do setor</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(Object.entries(diag.area_scores) as Array<[string, number]>).map(([k, v]) => {
                const c = v >= 61 ? "#00c896" : v >= 41 ? "#f5c842" : "#ff4055";
                const bm = (ai as { benchmark?: { area_comparison?: Record<string, { sector_avg: number }> } }).benchmark;
                const avg = bm?.area_comparison?.[k]?.sector_avg ?? null;
                const diff = avg !== null ? Math.round(v - avg) : null;
                return (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 120, fontSize: 12, color: "#c8daf0", flexShrink: 0 }}>{AREA_PT[k] || k}</div>
                    <div style={{ flex: 1, height: 8, background: "#1a3355", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                      <div style={{ width: `${v}%`, height: "100%", background: c, borderRadius: 4, transition: "width .6s ease" }} />
                      {avg !== null && (
                        <div style={{ position: "absolute", top: 0, left: `${avg}%`, width: 2, height: "100%", background: "#4da6ff", opacity: 0.7 }} />
                      )}
                    </div>
                    <div style={{ width: 70, textAlign: "right", fontSize: 12, fontWeight: 700, color: c, whiteSpace: "nowrap" }}>
                      {v}/100
                      {diff !== null && <span style={{ fontSize: 10, fontWeight: 400, color: diff >= 0 ? "#00c896" : "#ff4055", marginLeft: 4 }}>{diff >= 0 ? `+${diff}` : diff}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <BenchmarkCard benchmark={(ai as { benchmark?: { sector_avg_score?: number; position?: string; sector_context?: string } }).benchmark} globalScore={score} />
          </div>
        ) : null}

        {/* Quick wins */}
        {Array.isArray((ai as { quick_wins?: unknown[] }).quick_wins) && (ai as { quick_wins?: unknown[] }).quick_wins!.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>Quick Wins</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {((ai as { quick_wins?: Array<{ title: string; description: string; tool: string; tool_cost: string; impact: string }> }).quick_wins || []).map((w, i) => (
                <div key={i} style={{ padding: "14px 16px", background: "#102240", border: "1px solid #1e3a5f", borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: "#4da6ff", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>Quick Win {i + 1}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f4f8ff", marginBottom: 6 }}>{w.title}</div>
                  <div style={{ fontSize: 13, color: "#c8daf0", lineHeight: 1.6, marginBottom: 8 }}>{w.description}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ background: "rgba(0,229,200,.1)", border: "1px solid rgba(0,229,200,.2)", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#00e5c8" }}>
                      {w.tool} — {w.tool_cost}
                    </span>
                    <span style={{ fontSize: 12, color: "#7a9ec8" }}>Impacto: {w.impact}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Roadmap */}
        {Boolean((ai as { roadmap?: unknown }).roadmap) && (
          <RoadmapSection
            roadmap={(ai as { roadmap: Record<string, { title: string; subtitle: string; actions: Array<{ title: string; description: string; tool: string }> }> }).roadmap}
            reportId={report.id}
            userId={userId}
          />
        )}

        {/* Evolucao-only: process audit */}
        {isEvolucao && Boolean((ai as { process_audit?: unknown }).process_audit) && (
          <ProcessAuditSection audit={(ai as { process_audit: { process_name: string; current_state: string; automation_potential: number; hours_saved_week: number; money_saved_month: string; steps: Array<{ label: string; status: string; fix: string }> } }).process_audit} />
        )}

        {!isEvolucao && (
          <div style={{ marginTop: 16, padding: "16px 20px", background: "rgba(0,229,200,.04)", border: "1px dashed rgba(0,229,200,.2)", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#7a9ec8", marginBottom: 8 }}>Auditoria de Processos e Gaps disponível no plano <strong style={{ color: "#00e5c8" }}>Evolução</strong></div>
          </div>
        )}

        {/* Ativar: show solution cards for top gaps — Premium users only */}
        {isPremium && topGaps.length > 0 && (
          <AtivarSection
            topGaps={topGaps}
            diagnosticId={report.id}
            clientEmail={userEmail ?? ""}
            clientName={clientName ?? ""}
            sector={diag?.sector ?? ""}
            diagnosticScore={score}
          />
        )}
      </div>
    </div>
  );
}

function RoadmapSection({ roadmap, reportId, userId }: { roadmap: Record<string, { title: string; subtitle: string; actions: Array<{ title: string; description: string; tool: string }> }>; reportId: string; userId?: string }) {
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !reportId) return;
    supabase
      .from("roadmap_progress")
      .select("phase, action_index, completed")
      .eq("user_id", userId)
      .eq("report_id", reportId)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, boolean> = {};
        data.forEach(r => { map[`${r.phase}-${r.action_index}`] = r.completed; });
        setProgress(map);
      });
  }, [reportId, userId]);

  async function toggleAction(phase: string, idx: number) {
    if (!userId || !reportId) return;
    const key = `${phase}-${idx}`;
    const newVal = !progress[key];
    setSaving(key);
    setProgress(prev => ({ ...prev, [key]: newVal }));
    await supabase.from("roadmap_progress").upsert({
      user_id: userId,
      report_id: reportId,
      phase,
      action_index: idx,
      completed: newVal,
      completed_at: newVal ? new Date().toISOString() : null,
    }, { onConflict: "user_id,report_id,phase,action_index" });
    setSaving(null);
  }

  const phases = [
    { key: "d30", label: "30 dias", color: "#4da6ff" },
    { key: "d60", label: "60 dias", color: "#00e5c8" },
    { key: "d90", label: "90 dias", color: "#00c896" },
  ];

  const totalActions = phases.reduce((sum, { key }) => sum + (roadmap[key]?.actions?.length || 0), 0);
  const doneActions = Object.values(progress).filter(Boolean).length;
  const pct = totalActions > 0 ? Math.round((doneActions / totalActions) * 100) : 0;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase" }}>Roadmap 30/60/90 Dias</div>
        {userId && totalActions > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 80, height: 6, background: "#1a3355", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#00c896", borderRadius: 4, transition: "width .4s" }} />
            </div>
            <span style={{ fontSize: 11, color: "#00c896", fontWeight: 700 }}>{pct}% concluído</span>
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {phases.map(({ key, label, color }) => {
          const ph = roadmap[key];
          if (!ph) return null;
          return (
            <div key={key} style={{ background: "#102240", border: "1px solid #1e3a5f", borderRadius: 10, padding: 16, borderTop: `3px solid ${color}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>Fase {label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f4f8ff", marginBottom: 4 }}>{ph.title}</div>
              <div style={{ fontSize: 12, color: "#7a9ec8", marginBottom: 10 }}>{ph.subtitle}</div>
              {(ph.actions || []).map((a, i) => {
                const k = `${key}-${i}`;
                const done = !!progress[k];
                const isSaving = saving === k;
                return (
                  <div
                    key={i}
                    onClick={() => toggleAction(key, i)}
                    style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, cursor: userId ? "pointer" : "default", opacity: isSaving ? 0.6 : 1, transition: "opacity .15s" }}
                  >
                    {userId && (
                      <div style={{ flexShrink: 0, marginTop: 2, width: 14, height: 14, borderRadius: 3, border: `2px solid ${done ? color : "#1e3a5f"}`, background: done ? color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                        {done && <svg width="8" height="6" viewBox="0 0 8 6"><polyline points="1,3 3,5 7,1" fill="none" stroke="#040812" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: done ? "#4a6fa0" : "#c8daf0", textDecoration: done ? "line-through" : "none", transition: "all .2s" }}>
                        <strong style={{ color: done ? "#4a6fa0" : "#e8f2ff" }}>{a.title}</strong>
                        {a.tool && <span style={{ color: "#4a6fa0" }}> &middot; {a.tool}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProcessAuditSection({ audit }: { audit: { process_name: string; current_state: string; automation_potential: number; hours_saved_week: number; money_saved_month: string; steps: Array<{ label: string; status: string; fix: string }> } }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>
        Auditoria do Processo Crítico
        <span style={{ marginLeft: 8, background: "rgba(0,229,200,.1)", border: "1px solid rgba(0,229,200,.2)", borderRadius: 99, padding: "2px 8px", fontSize: 10, color: "#00e5c8", fontWeight: 700 }}>Evolução</span>
      </div>
      <div style={{ background: "#102240", border: "1px solid #1e3a5f", borderRadius: 10, padding: 20, marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f4f8ff", marginBottom: 6 }}>{audit.process_name}</div>
        <div style={{ fontSize: 13, color: "#c8daf0", lineHeight: 1.6, marginBottom: 16 }}>{audit.current_state}</div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {[
            { val: `${audit.automation_potential}%`, label: "Potencial de automação", color: "#00e5c8" },
            { val: `${audit.hours_saved_week}h`, label: "Horas salvas/semana", color: "#4da6ff" },
            { val: `R$${audit.money_saved_month}`, label: "Economia mensal", color: "#f5c842" },
          ].map(({ val, label, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 11, color: "#4a6fa0", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
      {(audit.steps || []).map((s, i) => {
        const sc = s.status === "automated" ? "#00c896" : s.status === "partial" ? "#f5c842" : "#ff4055";
        const sl = s.status === "automated" ? "Automatizado" : s.status === "partial" ? "Parcial" : "Manual";
        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8, padding: "12px 14px", background: "#102240", border: "1px solid #1e3a5f", borderRadius: 8 }}>
            <div style={{ flexShrink: 0, padding: "3px 8px", borderRadius: 4, background: `${sc}22`, border: `1px solid ${sc}44`, fontSize: 11, fontWeight: 700, color: sc, whiteSpace: "nowrap" }}>{sl}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e8f2ff" }}>{s.label}</div>
              <div style={{ fontSize: 12, color: "#7a9ec8", marginTop: 2 }}>{s.fix}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BenchmarkCard({ benchmark, globalScore }: { benchmark?: { sector_avg_score?: number; position?: string; sector_context?: string } | null; globalScore: number }) {
  if (!benchmark?.sector_avg_score) return null;
  const avg = benchmark.sector_avg_score;
  const pos = benchmark.position;
  const posColor = pos === "acima" ? "#00c896" : pos === "abaixo" ? "#ff4055" : "#f5c842";
  const posLabel = pos === "acima" ? "Acima da média" : pos === "abaixo" ? "Abaixo da média" : "Na média";
  return (
    <div style={{ marginTop: 14, padding: "14px 16px", background: "#0a1628", border: "1px solid #1a3355", borderRadius: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#4da6ff", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>Benchmark do Setor</div>
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#7a9ec8", lineHeight: 1 }}>{avg}</div>
          <div style={{ fontSize: 10, color: "#4a6fa0", marginTop: 2 }}>Média do setor</div>
        </div>
        <div style={{ fontSize: 16, color: "#1e3a5f" }}>vs</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: posColor, lineHeight: 1 }}>{globalScore}</div>
          <div style={{ fontSize: 10, color: "#4a6fa0", marginTop: 2 }}>Sua empresa</div>
        </div>
        <div style={{ display: "inline-block", background: `${posColor}18`, border: `1px solid ${posColor}44`, borderRadius: 99, padding: "3px 12px", fontSize: 11, fontWeight: 700, color: posColor }}>{posLabel}</div>
      </div>
      {benchmark.sector_context && <div style={{ marginTop: 10, fontSize: 12, color: "#4a6fa0", lineHeight: 1.6 }}>{benchmark.sector_context}</div>}
    </div>
  );
}

function ScoreEvolutionChart({ reports, isEvolucao }: { reports: ReportItem[]; isEvolucao: boolean }) {
  const sorted = [...reports].reverse();

  if (!isEvolucao) {
    // Upsell teaser: show blurred mock chart with lock overlay
    const mockScores = [38, 45, 52, 61, 58, 67];
    const chartW = 460, chartH = 140;
    const pad = { t: 16, r: 20, b: 32, l: 40 };
    const innerW = chartW - pad.l - pad.r;
    const innerH = chartH - pad.t - pad.b;
    const mockPts = mockScores.map((s, i) => ({
      x: (i / (mockScores.length - 1)) * innerW,
      y: innerH - (s / 100) * innerH,
    }));
    const polyline = mockPts.map(p => `${pad.l + p.x},${pad.t + p.y}`).join(" ");
    const area = `M${pad.l + mockPts[0].x},${pad.t + innerH} ` + mockPts.map(p => `L${pad.l + p.x},${pad.t + p.y}`).join(" ") + ` L${pad.l + mockPts[mockPts.length - 1].x},${pad.t + innerH} Z`;

    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase" }}>Evolução do Score</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(0,229,200,.08)", border: "1px solid rgba(0,229,200,.2)", borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#00e5c8", letterSpacing: ".08em", textTransform: "uppercase" }}>
            <Star size={9} /> Evolução
          </div>
        </div>
        <div style={{ position: "relative", background: "#102240", border: "1px solid #1e3a5f", borderRadius: 10, overflow: "hidden" }}>
          {/* Blurred mock chart */}
          <div style={{ filter: "blur(3px)", userSelect: "none", pointerEvents: "none" }}>
            <div style={{ padding: "16px 20px" }}>
              <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", maxWidth: chartW, display: "block" }}>
                <defs>
                  <linearGradient id="mockGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a7ff0" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#1a7ff0" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {[0, 25, 50, 75, 100].map(v => {
                  const y = pad.t + innerH - (v / 100) * innerH;
                  return <line key={v} x1={pad.l} y1={y} x2={pad.l + innerW} y2={y} stroke="#1a3355" strokeWidth={1} />;
                })}
                <path d={area} fill="url(#mockGrad)" />
                <polyline points={polyline} fill="none" stroke="#1a7ff0" strokeWidth={2.5} strokeLinejoin="round" />
                {mockPts.map((p, i) => (
                  <circle key={i} cx={pad.l + p.x} cy={pad.t + p.y} r={5} fill="#1a7ff0" stroke="#0a1628" strokeWidth={2} />
                ))}
              </svg>
            </div>
          </div>
          {/* Lock overlay */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(4,8,18,.6)", backdropFilter: "blur(1px)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00e5c8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f4f8ff" }}>Histórico de evolução</div>
            <div style={{ fontSize: 12, color: "#7a9ec8", textAlign: "center", maxWidth: 220 }}>
              Acompanhe a evolução do seu score ao longo do tempo com o plano Evolução.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Evolucao: real chart
  const chartW = 500, chartH = 160;
  const pad = { t: 20, r: 24, b: 36, l: 44 };
  const innerW = chartW - pad.l - pad.r;
  const innerH = chartH - pad.t - pad.b;

  const points = sorted.map((r, i) => {
    const score = r.diagnostic_responses?.global_score ?? 0;
    const x = sorted.length === 1 ? innerW / 2 : (i / (sorted.length - 1)) * innerW;
    const y = innerH - (score / 100) * innerH;
    return {
      x, y, score,
      date: new Date(r.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      color: score >= 61 ? "#00c896" : score >= 41 ? "#f5c842" : "#ff4055",
    };
  });

  const last = points[points.length - 1];
  const first = points[0];
  const delta = last.score - first.score;
  const deltaColor = delta > 0 ? "#00c896" : delta < 0 ? "#ff4055" : "#7a9ec8";
  const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;

  const polyline = points.map(p => `${pad.l + p.x},${pad.t + p.y}`).join(" ");
  const areaPath = `M${pad.l + points[0].x},${pad.t + innerH} ` + points.map(p => `L${pad.l + p.x},${pad.t + p.y}`).join(" ") + ` L${pad.l + last.x},${pad.t + innerH} Z`;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase" }}>Evolução do Score</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(0,229,200,.08)", border: "1px solid rgba(0,229,200,.2)", borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#00e5c8", letterSpacing: ".08em", textTransform: "uppercase" }}>
            <Star size={9} /> Evolução
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#4a6fa0" }}>Score atual</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: last.color, lineHeight: 1 }}>{last.score}</div>
          </div>
          {sorted.length > 1 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#4a6fa0" }}>Variação total</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: deltaColor, lineHeight: 1 }}>{deltaLabel} pts</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ background: "#102240", border: "1px solid #1e3a5f", borderRadius: 10, padding: "16px 20px", overflowX: "auto" }}>
        {sorted.length === 1 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 0", gap: 8 }}>
            <div style={{ fontSize: 44, fontWeight: 700, color: last.color, lineHeight: 1 }}>{last.score}</div>
            <div style={{ fontSize: 12, color: "#4a6fa0" }}>Primeiro diagnóstico — {last.date}</div>
            <div style={{ fontSize: 12, color: "#7a9ec8", marginTop: 4, textAlign: "center", maxWidth: 280 }}>
              Realize um novo diagnóstico para ver a evolução do seu score ao longo do tempo.
            </div>
          </div>
        ) : (
          <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", maxWidth: chartW, display: "block" }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1a7ff0" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#1a7ff0" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map(v => {
              const y = pad.t + innerH - (v / 100) * innerH;
              return (
                <g key={v}>
                  <line x1={pad.l} y1={y} x2={pad.l + innerW} y2={y} stroke="#1a3355" strokeWidth={v === 0 ? 1.5 : 1} strokeDasharray={v === 0 ? "none" : "4 4"} />
                  <text x={pad.l - 8} y={y + 4} fontSize={9} fill="#4a6fa0" textAnchor="end">{v}</text>
                </g>
              );
            })}
            {/* Area fill */}
            <path d={areaPath} fill="url(#areaGrad)" />
            {/* Trend line */}
            <polyline points={polyline} fill="none" stroke="#1a7ff0" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {/* Data points */}
            {points.map((p, i) => (
              <g key={i}>
                {/* Glow ring */}
                <circle cx={pad.l + p.x} cy={pad.t + p.y} r={8} fill={p.color} fillOpacity="0.15" />
                <circle cx={pad.l + p.x} cy={pad.t + p.y} r={5} fill={p.color} stroke="#0a1628" strokeWidth={2} />
                {/* Score label above */}
                <text x={pad.l + p.x} y={pad.t + p.y - 12} fontSize={11} fill={p.color} textAnchor="middle" fontWeight="700">{p.score}</text>
                {/* Date label below axis */}
                <text x={pad.l + p.x} y={pad.t + innerH + 18} fontSize={9} fill="#4a6fa0" textAnchor="middle">{p.date}</text>
              </g>
            ))}
            {/* Delta arrow between first and last */}
            {points.length > 1 && delta !== 0 && (
              <text
                x={pad.l + last.x + 12}
                y={pad.t + last.y + 4}
                fontSize={10}
                fill={deltaColor}
                fontWeight="700"
              >{deltaLabel}</text>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

interface Playbook {
  title: string;
  description: string;
  steps: string[];
  tool: string;
  time: string;
  impact: string;
  difficulty: "iniciante" | "intermediario" | "avancado";
  area: string;
  cost: string;
}

const PLAYBOOKS: Record<string, Playbook[]> = {
  geral: [
    { title: "Automatizar Atendimento com IA", description: "Configure um chatbot com IA para responder perguntas frequentes via WhatsApp e site, reduzindo o volume de atendimento manual em até 60% sem aumentar a equipe.", steps: ["Liste as 20 perguntas mais frequentes dos seus clientes", "Crie os fluxos de resposta no ManyChat ou Kommo", "Conecte ao WhatsApp Business API e ao seu site", "Configure escalonamento para humanos em casos complexos", "Mensure taxa de resolução automática semanalmente"], tool: "ManyChat / Kommo", time: "2 semanas", impact: "40-60% menos consultas manuais", difficulty: "iniciante", area: "service", cost: "R$97-297/mês" },
    { title: "Pipeline de Vendas Automatizado", description: "Implemente um CRM com automações que movem leads entre etapas, disparam follow-ups no momento certo e alertam vendedores sobre oportunidades quentes.", steps: ["Implante o HubSpot CRM (plano gratuito)", "Mapeie cada etapa do seu processo de vendas atual", "Configure automações de follow-up por email e WhatsApp", "Integre formulários do site e landing pages ao CRM", "Defina alertas de oportunidade para o time comercial"], tool: "HubSpot CRM", time: "1 semana", impact: "+25% na taxa de conversão", difficulty: "iniciante", area: "sales", cost: "Gratuito / R$90/mês" },
    { title: "Dashboards Automáticos com BI", description: "Substitua planilhas manuais por dashboards atualizados em tempo real com dados de vendas, financeiro e operações — acessíveis de qualquer lugar.", steps: ["Conecte suas fontes de dados ao Google Looker Studio", "Crie o dashboard principal com seus 5-7 KPIs críticos", "Configure atualização automática diária dos dados", "Agende envio semanal por email para a diretoria", "Treine a equipe na leitura e interpretação dos indicadores"], tool: "Google Looker Studio", time: "3 dias", impact: "10h/semana economizadas", difficulty: "iniciante", area: "data", cost: "Gratuito" },
    { title: "Email Marketing com Segmentação por IA", description: "Crie campanhas de email que se adaptam ao comportamento do usuário, enviando a mensagem certa para cada segmento no momento de maior engajamento.", steps: ["Importe sua base de contatos no RD Station ou Mailchimp", "Defina 3-5 segmentos com base em comportamento e histórico", "Crie fluxos de automação para cada segmento", "Configure testes A/B para assuntos e CTAs", "Analise taxas de abertura e ajuste frequência de envio"], tool: "RD Station / Mailchimp", time: "1 semana", impact: "+35% na taxa de abertura", difficulty: "iniciante", area: "sales", cost: "R$50-200/mês" },
    { title: "Automação de Processos com Make", description: "Conecte seus apps favoritos e automatize tarefas repetitivas — de sincronizar dados entre sistemas a notificar equipes automaticamente.", steps: ["Mapeie os 3 processos mais repetitivos da sua operação", "Crie conta no Make e conecte seus apps (Google, Slack, etc)", "Monte o primeiro cenário de automação passo a passo", "Teste com dados reais e ajuste condições de erro", "Documente o fluxo e treine a equipe responsável"], tool: "Make (Integromat)", time: "3 dias", impact: "5-8h/semana por processo automatizado", difficulty: "iniciante", area: "process", cost: "Gratuito / R$50/mês" },
    { title: "Base de Conhecimento com IA para Equipe", description: "Crie uma wiki inteligente onde a equipe encontra respostas instantaneamente com busca por IA, eliminando interrupções e acelerando onboarding.", steps: ["Crie workspace no Notion para centralizar o conhecimento", "Importe documentos, SOPs e procedimentos existentes", "Estruture hierarquia de páginas por departamento", "Ative o Notion AI para busca e resumo automático", "Defina responsáveis por atualizar cada seção mensalmente"], tool: "Notion AI", time: "1 semana", impact: "Redução de 50% em perguntas repetitivas", difficulty: "iniciante", area: "process", cost: "R$50/mês" },
  ],
  varejo: [
    { title: "Gestão de Estoque com Previsão de Demanda", description: "Use algoritmos para automatizar reposição de estoque com base no histórico de vendas, sazonalidade e tendências, eliminando ruptura e excesso de inventário.", steps: ["Exporte histórico de vendas dos últimos 12-24 meses por SKU", "Configure alertas de estoque mínimo no Tiny ERP ou Bling", "Implemente regras de reposição automática por categoria", "Integre com fornecedores principais via pedido automático por email", "Revise previsões mensalmente e ajuste parâmetros sazonais"], tool: "Tiny ERP / Bling", time: "2 semanas", impact: "Redução de 30% em ruptura", difficulty: "intermediario", area: "process", cost: "R$150-400/mês" },
    { title: "Programa de Fidelidade Automatizado", description: "Lance um programa de pontos e cashback que roda sozinho — acúmulo, resgate e comunicação com clientes 100% automatizados.", steps: ["Defina estrutura de pontos e benefícios por faixa", "Configure o LoyaltyLion ou Smile.io na sua loja", "Integre com sua plataforma de e-commerce (VTEX, Shopify, etc)", "Crie fluxo de email automático para ativação e resgate", "Comunique o programa via WhatsApp e email na base atual"], tool: "Smile.io / LoyaltyLion", time: "2 semanas", impact: "+40% em recompra", difficulty: "intermediario", area: "sales", cost: "R$200-600/mês" },
    { title: "Precificação Dinâmica com IA", description: "Monitore preços de concorrentes em tempo real e ajuste automaticamente suas margens para maximizar competitividade sem sacrificar rentabilidade.", steps: ["Mapeie os 50 produtos mais estratégicos do seu mix", "Configure o Prisync ou Competera para monitorar concorrentes", "Defina regras de precificação por margem mínima e máxima", "Ative ajuste automático para produtos de alta concorrência", "Revise semanalmente os impactos em volume e margem"], tool: "Prisync / Competera", time: "1 semana", impact: "+15% na margem bruta", difficulty: "avancado", area: "data", cost: "R$500-1200/mês" },
    { title: "Recuperação de Carrinho Abandonado", description: "Recupere automaticamente clientes que abandonaram o carrinho com sequências personalizadas de email, SMS e WhatsApp nos momentos certos.", steps: ["Configure tracking de abandono na sua plataforma de e-commerce", "Crie sequência de 3 mensagens: 1h, 24h e 72h após abandono", "Personalize com nome do produto e foto no email", "Adicione cupom progressivo na 3ª mensagem (ex: 10% off)", "Mensure taxa de recuperação e receita recuperada por canal"], tool: "Klaviyo / RD Station", time: "3 dias", impact: "Recupera 10-15% dos carrinhos", difficulty: "iniciante", area: "sales", cost: "R$150-400/mês" },
    { title: "Atendimento Omnichannel com IA", description: "Unifique WhatsApp, Instagram, site e telefone em uma única plataforma com triagem automática por IA, eliminando mensagens perdidas.", steps: ["Configure o Zendesk ou Freshdesk como central de atendimento", "Integre todos os canais de comunicação na plataforma", "Crie respostas automáticas para as top 30 perguntas", "Defina regras de roteamento por assunto para cada agente", "Implante CSAT automático após cada atendimento"], tool: "Zendesk / Freshdesk", time: "2 semanas", impact: "NPS +20 pontos", difficulty: "intermediario", area: "service", cost: "R$400-900/mês" },
    { title: "Análise de Sentimento de Reviews com IA", description: "Monitore automaticamente avaliações em Google, Reclame Aqui e redes sociais e receba alertas instantâneos de comentários negativos.", steps: ["Configure o Mention ou Sprinklr para monitorar sua marca", "Ative análise de sentimento automática com IA", "Crie alerta imediato para avaliações negativas (1-2 estrelas)", "Monte template de resposta padrão para cada tipo de reclamação", "Gere relatório semanal de NPS e principais temas"], tool: "Mention / Sprinklr", time: "3 dias", impact: "Resposta em <2h a reviews negativos", difficulty: "iniciante", area: "service", cost: "R$200-500/mês" },
  ],
  servicos: [
    { title: "Agendamento Online com Lembretes Automáticos", description: "Elimine no-shows com agendamento 24/7 e lembretes automáticos por WhatsApp e email, liberando sua recepcionista para tarefas de maior valor.", steps: ["Configure o Calendly ou Doctoralia com seus horários disponíveis", "Integre com Google Calendar para sincronização em tempo real", "Configure lembretes: 24h antes via email, 2h antes via WhatsApp", "Crie fluxo de confirmação de presença com opção de reagendamento", "Adicione link de agendamento no Instagram Bio, site e assinatura de email"], tool: "Calendly + Zapier", time: "3 dias", impact: "Redução de 70% em no-shows", difficulty: "iniciante", area: "service", cost: "R$50-150/mês" },
    { title: "Proposta Comercial Inteligente com IA", description: "Gere propostas personalizadas em minutos com templates inteligentes e IA — sem copiar e colar — e assine digitalmente sem sair da plataforma.", steps: ["Crie template master de proposta no PandaDoc com suas variáveis", "Conecte ao CRM para puxar dados do cliente automaticamente", "Use o Claude ou ChatGPT para personalizar o escopo narrativo", "Configure assinatura digital com notificação de abertura e assinatura", "Mensure tempo médio de envio e taxa de aprovação por vendedor"], tool: "PandaDoc + Claude AI", time: "4 dias", impact: "Propostas 5x mais rápidas", difficulty: "iniciante", area: "sales", cost: "R$150-350/mês" },
    { title: "Onboarding de Clientes Automatizado", description: "Crie uma jornada de onboarding que guia novos clientes pelos primeiros 30 dias com tutoriais, checklists e check-ins automáticos.", steps: ["Mapeie os marcos críticos dos primeiros 30 dias de um cliente", "Construa a sequência de emails no Customer.io ou RD Station", "Crie portal de onboarding no Notion com checklists interativos", "Configure alertas de risco para clientes que não completam etapas", "Metrize tempo até primeiro valor (TTV) e taxa de conclusão do onboarding"], tool: "Customer.io / Notion", time: "2 semanas", impact: "Redução de 40% em churn no 1º mês", difficulty: "intermediario", area: "service", cost: "R$200-500/mês" },
    { title: "Cobrança e Inadimplência Automatizadas", description: "Automatize todo o ciclo de cobrança — de lembretes preventivos até regras de bloqueio — eliminando constrangimentos e recuperando receita passiva.", steps: ["Integre sua cobrança ao Asaas ou Iugu para gestão financeira", "Configure sequência de alertas: D-3, vencimento, D+1, D+7", "Personalize tom das mensagens por canal (email mais formal, WhatsApp mais direto)", "Defina regras automáticas de bloqueio de acesso após X dias", "Crie dashboard de inadimplência com aging report automático"], tool: "Asaas / Iugu", time: "1 semana", impact: "Redução de 35% na inadimplência", difficulty: "iniciante", area: "process", cost: "Taxa sobre transações" },
    { title: "Gestão de Projetos com IA", description: "Centralize projetos, prazos e equipes com automação inteligente que antecipa atrasos, redistribui tarefas e gera status reports automaticamente.", steps: ["Implante o ClickUp ou Monday.com como central de projetos", "Migre projetos ativos e defina templates por tipo de serviço", "Configure automações de notificação para prazos em risco", "Ative assistente de IA para resumir status e gerar atas de reunião", "Conecte ao faturamento para visibilidade de margem por projeto"], tool: "ClickUp / Monday.com", time: "2 semanas", impact: "Redução de 25% em atrasos", difficulty: "intermediario", area: "process", cost: "R$100-400/mês" },
    { title: "Voice of Customer com NPS Automatizado", description: "Colete feedback continuamente com NPS automático após cada entrega e use IA para identificar padrões e prevenir churn antes que aconteça.", steps: ["Configure o Delighted ou SatisMeter para disparar NPS automático", "Defina gatilhos de envio: 7 dias após onboarding, após cada entrega", "Crie fluxo de resposta automática para detratores (escala para CS)", "Analise mensalmente os verbatims com IA para temas recorrentes", "Compartilhe NPS consolidado na reunião de liderança mensalmente"], tool: "Delighted / SatisMeter", time: "3 dias", impact: "+15 pontos de NPS em 90 dias", difficulty: "iniciante", area: "service", cost: "R$150-300/mês" },
  ],
  industria: [
    { title: "Manutenção Preditiva com IoT e IA", description: "Monitore equipamentos críticos em tempo real com sensores IoT e preveja falhas antes que causem paradas, reduzindo custos de manutenção corretiva.", steps: ["Instale sensores de temperatura, vibração e consumo nos equipamentos críticos", "Configure plataforma de IoT (Thingsboard ou AWS IoT) para coleta de dados", "Treine modelo de ML com histórico de falhas dos últimos 2 anos", "Defina limiares de alerta e protocolo de resposta para cada equipamento", "Calcule ROI comparando custo de manutenção preventiva vs corretiva"], tool: "Thingsboard + Python/ML", time: "6 semanas", impact: "Redução de 50% em paradas não planejadas", difficulty: "avancado", area: "infra", cost: "R$2.000-8.000/mês" },
    { title: "Controle de Qualidade com Visão Computacional", description: "Substitua inspeções visuais manuais por câmeras com IA que detectam defeitos em tempo real na linha de produção, com precisão superior ao humano.", steps: ["Mapeie os pontos críticos de inspeção na linha de produção", "Instale câmeras industriais (resolução mínima 5MP) nos postos críticos", "Configure o Cognex VisionPro ou solução open-source com OpenCV", "Treine o modelo com imagens de defeitos históricos (mínimo 500 por classe)", "Defina protocolo de descarte automático e alerta para supervisor"], tool: "Cognex VisionPro / OpenCV", time: "4 semanas", impact: "Redução de 40% no retrabalho", difficulty: "avancado", area: "process", cost: "R$3.000-15.000 (implantação)" },
    { title: "MES — Sistema de Execução de Manufatura", description: "Implante um MES para rastrear ordens de produção em tempo real, eliminar papel do chão de fábrica e ter visibilidade total do OEE.", steps: ["Mapeie o fluxo de produção atual e identifique gargalos", "Selecione e implante o MES (Totvs, SAP ME ou solução open-source)", "Integre com ERP existente para sincronizar ordens e materiais", "Treine operadores na entrada de dados em tablets no chão de fábrica", "Configure dashboard de OEE em tempo real para gestores"], tool: "Totvs / SAP Manufacturing", time: "8 semanas", impact: "+20% no OEE", difficulty: "avancado", area: "process", cost: "R$5.000-20.000/mês" },
    { title: "Automação de Orçamentos e Pedidos", description: "Elimine planilhas e emails para orçamentos — crie um configurador de produtos que gera orçamentos automaticamente e alimenta o ERP sem retrabalho.", steps: ["Mapeie todas as variações de produto e regras de precificação", "Configure o Salesforce CPQ ou Cotações no HubSpot", "Integre com o ERP para verificação de estoque em tempo real", "Crie portal do cliente para acompanhamento de pedidos", "Implante assinatura digital de pedidos e contratos"], tool: "Salesforce CPQ / HubSpot", time: "3 semanas", impact: "Ciclo de vendas 60% mais rápido", difficulty: "intermediario", area: "sales", cost: "R$500-2.000/mês" },
    { title: "Gestão de Fornecedores com IA", description: "Centralize avaliação, homologação e performance de fornecedores com scoring automático e alertas de risco na cadeia de suprimentos.", steps: ["Crie cadastro unificado de fornecedores com critérios de avaliação", "Configure scoring automático por qualidade, prazo e preço no ERP", "Implante portal de fornecedores para auto-atendimento e upload de docs", "Configure alertas de vencimento de certificações e contratos", "Gere relatório trimestral de performance para renegociação"], tool: "SAP Ariba / Basware", time: "4 semanas", impact: "Redução de 15% no custo de compras", difficulty: "intermediario", area: "data", cost: "R$1.000-5.000/mês" },
    { title: "Energia Inteligente com IA", description: "Monitore e otimize o consumo de energia da fábrica com IA, identificando desperdícios, programando equipamentos fora do horário de ponta.", steps: ["Instale medidores inteligentes nos quadros elétricos principais", "Configure plataforma de gestão de energia (EnergyCAP ou similar)", "Identifique os 5 maiores consumidores e horários de pico", "Programe automação de desligamento em horário de ponta", "Calcule ROI e meta de redução mensal com incentivos para a equipe"], tool: "EnergyCAP / Siemens EnergyIP", time: "3 semanas", impact: "Redução de 20-30% na conta de energia", difficulty: "intermediario", area: "infra", cost: "R$500-2.000/mês" },
  ],
  saude: [
    { title: "Prontuário Eletrônico com IA Clínica", description: "Migre do papel para prontuário eletrônico com ditado por voz e sugestões de IA, reduzindo tempo administrativo para médicos e enfermeiros.", steps: ["Avalie e selecione o sistema (iClinic, Amplimed ou similar) adequado ao porte", "Migre prontuários históricos em lotes por especialidade", "Treine equipe clínica no uso do app mobile e módulos de prescrição", "Configure integração com laboratórios e clínicas parceiras", "Ative módulo de IA para sugestão de CID e prescrições frequentes"], tool: "iClinic / Amplimed", time: "4 semanas", impact: "Redução de 40% no tempo de registro", difficulty: "intermediario", area: "process", cost: "R$200-800/mês" },
    { title: "Telemedicina e Triagem Automatizada", description: "Ofereça consultas online com triagem pré-atendimento por chatbot de IA que coleta sintomas e direciona o paciente para o especialista correto.", steps: ["Configure plataforma de telemedicina (Docway, Conexa ou similar)", "Desenvolva fluxo de triagem com questionário de sintomas por chatbot", "Integre com agenda médica para agendamento automático pós-triagem", "Configure laudo digital e assinatura eletrônica integrados", "Comunique o serviço via WhatsApp e email para base de pacientes"], tool: "Conexa Saúde / Docway", time: "3 semanas", impact: "+30% em capacidade de atendimento", difficulty: "intermediario", area: "service", cost: "R$500-1.500/mês" },
    { title: "Lembrete Inteligente de Retorno", description: "Reduza a perda de pacientes com sequências automáticas de lembrete de retorno, personalizadas por tipo de tratamento e tempo desde a última visita.", steps: ["Extraia base de pacientes com data da última consulta do sistema", "Segmente por especialidade e intervalo recomendado de retorno", "Crie sequência automática: email 30 dias antes, WhatsApp 7 dias antes", "Configure link de agendamento direto na mensagem de lembrete", "Mensure taxa de retorno antes e depois por especialidade"], tool: "iClinic + Zapier", time: "1 semana", impact: "+25% na taxa de retorno", difficulty: "iniciante", area: "sales", cost: "R$100-300/mês" },
    { title: "Gestão Financeira de Clínica com BI", description: "Tenha visibilidade total da saúde financeira da clínica — faturamento por médico, taxa de inadimplência, receita por convênio — em tempo real.", steps: ["Integre o sistema de gestão ao Power BI ou Looker Studio", "Configure dashboard principal: faturamento, ticket médio, convênios", "Crie relatório de produtividade médica (consultas/dia, receita/hora)", "Configure alerta automático para inadimplência acima de 5%", "Compartilhe relatório mensal consolidado com sócios e gestores"], tool: "Power BI / Google Looker Studio", time: "2 semanas", impact: "Visibilidade total em tempo real", difficulty: "intermediario", area: "data", cost: "R$50-200/mês" },
  ],
  educacao: [
    { title: "LMS com Trilhas de Aprendizagem Adaptativas", description: "Implante um sistema de gestão de aprendizagem que adapta o ritmo e conteúdo para cada aluno com base em desempenho, aumentando conclusão de cursos.", steps: ["Avalie e selecione LMS (Moodle, Hotmart ou Teachable) conforme o porte", "Migre ou crie os cursos com estrutura de módulos e avaliações", "Configure trilhas adaptativas com pré-requisitos e desbloqueio progressivo", "Ative gamificação (pontos, badges, ranking) para engajamento", "Configure relatório automático de progresso para coordenadores"], tool: "Moodle / Hotmart", time: "4 semanas", impact: "+50% na taxa de conclusão", difficulty: "intermediario", area: "infra", cost: "Gratuito (Moodle) / R$300-1000/mês" },
    { title: "Secretaria Virtual com IA", description: "Automatize matrículas, rematrículas, solicitação de documentos e dúvidas burocráticas com chatbot de IA, liberando a equipe para atendimento complexo.", steps: ["Mapeie os 20 pedidos mais frequentes na secretaria", "Configure chatbot no WhatsApp Business (Typebot ou ManyChat)", "Integre com sistema acadêmico para consulta de notas e frequências", "Crie fluxo de solicitação de documentos com prazo automático", "Configure escalonamento para atendente humano em casos especiais"], tool: "Typebot / ManyChat", time: "2 semanas", impact: "70% das solicitações resolvidas sem humano", difficulty: "iniciante", area: "service", cost: "R$100-300/mês" },
    { title: "Captação de Alunos com Marketing Automatizado", description: "Crie funil de captação digital com anúncios segmentados, landing pages otimizadas e nurturing automatizado que converte leads em matrículas.", steps: ["Crie landing page de captação com formulário integrado ao CRM", "Configure campanha de Meta Ads segmentada por região e perfil", "Implante sequência de nurturing: 7 emails em 14 dias após lead", "Configure WhatsApp automático para leads que não abriram emails", "Mensure CAC (custo de aquisição) por canal e otimize budget"], tool: "RD Station + Meta Ads", time: "2 semanas", impact: "Redução de 40% no CAC", difficulty: "intermediario", area: "sales", cost: "R$200-500/mês + verba de mídia" },
    { title: "Avaliação e Feedback Contínuo com IA", description: "Substitua provas tradicionais por avaliação contínua com IA que identifica gaps de aprendizagem por aluno e sugere intervenções personalizadas.", steps: ["Configure questionários adaptativos no sistema de avaliação", "Implante análise de dados de desempenho por aluno e turma", "Configure alertas automáticos para professores sobre alunos em risco", "Crie relatório individual mensal de progresso para responsáveis", "Use IA para sugerir materiais complementares por tópico com dificuldade"], tool: "Google Classroom + Socrative", time: "3 semanas", impact: "+30% no desempenho médio", difficulty: "intermediario", area: "data", cost: "Gratuito / R$200/mês" },
  ],
  financeiro: [
    { title: "Onboarding de Clientes com KYC Automatizado", description: "Automatize a validação de documentos e checagem de compliance no onboarding de novos clientes, reduzindo tempo de aprovação de dias para horas.", steps: ["Integre com API de validação de CPF/CNPJ e listas restritivas", "Configure OCR para leitura automática de documentos enviados", "Implante checagem automática de PEP e listas de sanções", "Crie fluxo de aprovação com alerta para analista em casos suspeitos", "Configure comunicação automática de status ao cliente por email/SMS"], tool: "Unico Check / Combate a Fraude", time: "3 semanas", impact: "Onboarding em <2h vs. 2 dias", difficulty: "avancado", area: "process", cost: "Por transação" },
    { title: "Análise de Crédito com Machine Learning", description: "Substitua planilhas e critérios manuais por modelo de ML que calcula probabilidade de inadimplência em segundos com base em centenas de variáveis.", steps: ["Compile histórico de concessões e inadimplência dos últimos 3 anos", "Prepare e limpe os dados para treinamento do modelo", "Treine modelo de classificação (Random Forest ou XGBoost)", "Implante API de scoring integrada ao seu sistema de concessão", "Monitore performance do modelo mensalmente e retreine com novos dados"], tool: "Python / AWS SageMaker", time: "8 semanas", impact: "Redução de 25% na inadimplência", difficulty: "avancado", area: "ai", cost: "R$2.000-10.000 (implantação)" },
    { title: "Open Finance e Integração Bancária", description: "Use o Open Finance para acessar dados financeiros de clientes com consentimento e oferecer produtos personalizados com base no perfil real de uso.", steps: ["Obtenha certificação como Iniciador de Pagamento junto ao Banco Central", "Integre com agregadores de Open Finance (Belvo, Plaid BR)", "Crie fluxo de consentimento claro e transparente para o usuário", "Desenvolva análise de extrato para scoring e ofertas personalizadas", "Implante dashboard de saúde financeira para o cliente"], tool: "Belvo / OpenBank API", time: "12 semanas", impact: "+40% em conversão de produtos financeiros", difficulty: "avancado", area: "data", cost: "R$5.000-30.000 (implantação)" },
    { title: "Automação de Conciliação Financeira", description: "Elimine conciliação manual de extratos bancários — automatize o cruzamento de pagamentos, boletos e cartões com os registros do sistema.", steps: ["Implante ferramenta de conciliação (Conta Azul, Omie ou ERP)", "Configure integração via API com todos os bancos utilizados", "Defina regras de classificação automática de receitas e despesas", "Configure alerta diário para transações não conciliadas", "Crie relatório de fluxo de caixa automático para a gestão"], tool: "Conta Azul / Omie ERP", time: "1 semana", impact: "Elimina 15h/mês de trabalho manual", difficulty: "iniciante", area: "process", cost: "R$150-400/mês" },
  ],
  agronegocio: [
    { title: "Agricultura de Precisão com IoT e Drones", description: "Monitore lavouras remotamente com sensores de solo e drones com IA, identificando zonas de estresse hídrico e deficiência nutricional antes que causem perdas.", steps: ["Instale sensores de umidade e temperatura do solo nas zonas críticas", "Configure plataforma de agricultura de precisão (Climate FieldView)", "Programe voos regulares de drone para mapeamento NDVI", "Integre dados de satélite (Sentinel-2) para área total da fazenda", "Crie mapas de prescrição de insumos por zona de manejo"], tool: "Climate FieldView / DJI Agras", time: "4 semanas", impact: "Redução de 20% em insumos", difficulty: "avancado", area: "ai", cost: "R$500-2.000/mês" },
    { title: "Rastreabilidade da Cadeia Produtiva", description: "Implante sistema de rastreabilidade do campo à mesa com QR codes e blockchain, abrindo mercados premium e facilitando certificações.", steps: ["Mapeie todos os pontos críticos da cadeia produtiva", "Configure plataforma de rastreabilidade (Origem Agro ou similar)", "Implante coleta de dados no campo via app mobile offline", "Gere QR code único por lote para consumidor final escanear", "Prepare documentação para certificações (GlobalG.A.P, Rainforest)"], tool: "Origem Agro / TraceLink", time: "6 semanas", impact: "Acesso a mercados premium com preço +30%", difficulty: "intermediario", area: "process", cost: "R$500-2.000/mês" },
    { title: "Gestão de Maquinário e Frota Agrícola", description: "Monitore telemetria de tratores e colhedoras em tempo real, otimize rotas de campo e preveja manutenções para maximizar disponibilidade no pico da safra.", steps: ["Instale rastreadores telemétricos nos equipamentos críticos", "Configure plataforma de gestão de frota (John Deere Ops Center ou similar)", "Defina plano de manutenção preventiva por horas de uso", "Configure alertas de operação fora do padrão (RPM, combustível)", "Calcule custo por hora de cada equipamento para decisão de troca"], tool: "John Deere Operations Center", time: "3 semanas", impact: "Aumento de 15% na disponibilidade mecânica", difficulty: "intermediario", area: "infra", cost: "R$300-1.000/mês" },
    { title: "Comercialização Digital e Mercado Futuro", description: "Automatize o acompanhamento de preços de commodities, alertas de oportunidade e execute ordens no mercado futuro com regras pré-definidas.", steps: ["Configure alertas de preço para suas principais culturas", "Integre feed de preços CEPEA, B3 e CBOT ao seu dashboard", "Defina regras de travamento por nível de preço e percentual de produção", "Configure relatório diário de posição e oportunidades para o gestor", "Integre com corretora para execução rápida de ordens"], tool: "Quant / AgriHub", time: "2 semanas", impact: "Melhora de 8-12% na receita líquida", difficulty: "intermediario", area: "sales", cost: "R$200-800/mês" },
  ],
  logistica: [
    { title: "Roteirização Inteligente com IA", description: "Otimize automaticamente as rotas de entrega considerando tráfego em tempo real, janelas de entrega e capacidade dos veículos, reduzindo custo por entrega.", steps: ["Mapeie todos os pontos de entrega e janelas de tempo restritas", "Configure plataforma de roteirização (Rotafácil, Route4Me ou HERE)", "Integre com sistema de pedidos para alimentação automática de novas entregas", "Treine motoristas no app de navegação com rota otimizada", "Mensure KPIs: custo/entrega, entregas no prazo, km rodado por rota"], tool: "Routeasy / Route4Me", time: "2 semanas", impact: "Redução de 25% no custo por entrega", difficulty: "intermediario", area: "process", cost: "R$300-1.000/mês" },
    { title: "WMS — Gestão de Armazém com IA", description: "Implante um WMS para eliminar erros de separação, otimizar o posicionamento de SKUs e aumentar a produtividade do armazém com picking guiado.", steps: ["Mapeie o layout do armazém e codifique todas as posições", "Implante o WMS (Totvs WMS, SAP Extended Warehouse ou open-source)", "Configure curva ABC para posicionamento de SKUs por giro", "Treine operadores no coletor de dados com picking por voz ou luz", "Mensure acurácia de inventário e produtividade antes vs. depois"], tool: "Totvs WMS / Infor WMS", time: "6 semanas", impact: "Redução de 60% em erros de separação", difficulty: "avancado", area: "process", cost: "R$1.000-5.000/mês" },
    { title: "Torre de Controle Logística em Tempo Real", description: "Centralize visibilidade de toda a cadeia — pedidos, estoques, transportes e ocorrências — em um único dashboard com alertas proativos.", steps: ["Integre todos os sistemas (ERP, TMS, WMS) em plataforma de dados", "Configure dashboard de torre de controle no Power BI ou Tableau", "Defina KPIs críticos e limiares de alerta (ex: atraso > 2h)", "Configure notificação automática para stakeholders em ocorrências", "Implante rotina diária de stand-up com base nos dados da torre"], tool: "Power BI / Tableau + APIs", time: "4 semanas", impact: "Redução de 30% no tempo de resolução de problemas", difficulty: "avancado", area: "data", cost: "R$500-2.000/mês" },
    { title: "Last Mile com Rastreamento ao Vivo", description: "Ofereça rastreamento em tempo real para clientes finais e automatize comunicações de status de entrega, reduzindo chamados de WISMO.", steps: ["Integre TMS ou sistema próprio com plataforma de tracking (AfterShip, 17track)", "Configure página de rastreamento white-label com sua marca", "Implante notificações proativas: saiu para entrega, entregue, tentativa falha", "Configure chatbot para consultas de WISMO (Where Is My Order)", "Mensure redução em chamados de atendimento sobre status de pedidos"], tool: "AfterShip / Intelipost", time: "2 semanas", impact: "Redução de 40% em chamados WISMO", difficulty: "iniciante", area: "service", cost: "R$200-600/mês" },
  ],
  construcao: [
    { title: "BIM 5D — Planejamento com Custo Integrado", description: "Implante modelagem BIM com dimensão de custo integrada para eliminar retrabalho orçamentário e ter visibilidade em tempo real do budget da obra.", steps: ["Treine equipe de engenharia no Autodesk Revit ou ArchiCAD", "Crie modelo BIM do projeto com todos os elementos parametrizados", "Integre com software de orçamento (Sinapi, Pini) para custo automático", "Configure comparativo planejado vs. realizado por etapa da obra", "Implante revisão semanal de desvios com equipe de obras"], tool: "Autodesk Revit + Navisworks", time: "8 semanas", impact: "Redução de 20% em desvios de orçamento", difficulty: "avancado", area: "process", cost: "R$1.000-3.000/mês" },
    { title: "Gestão de Obras em Campo com App Mobile", description: "Substitua o papel no canteiro por app mobile para registro de RDO, apontamento de serviços e ocorrências, com sincronização em tempo real.", steps: ["Selecione plataforma de gestão de obras (Sienge, Buildertrend ou GestBIM)", "Configure estrutura de projeto, atividades e responsáveis", "Treine engenheiros e mestres no uso do app de campo offline", "Configure fluxo de aprovação de RDO e medições eletrônicas", "Implante dashboard de avanço físico-financeiro para diretoria"], tool: "Sienge / Buildertrend", time: "3 semanas", impact: "Redução de 30% em retrabalho de documentação", difficulty: "intermediario", area: "process", cost: "R$300-1.000/mês" },
    { title: "Orçamento Automatizado com IA", description: "Gere orçamentos paramétricos em minutos com base em tipologia da obra e índices do mercado, reduzindo de 5 dias para 1 hora o tempo de proposta.", steps: ["Crie banco de dados de composições e índices próprios da empresa", "Configure template paramétrico por tipologia (residencial, comercial, etc)", "Use IA para leitura de memorial descritivo e extração de quantitativos", "Integre com tabela SINAPI atualizada automaticamente", "Implante aprovação e envio digital ao cliente com acompanhamento de abertura"], tool: "Orca + GPT / Volare", time: "4 semanas", impact: "Orçamento em 1h vs. 5 dias", difficulty: "intermediario", area: "sales", cost: "R$300-800/mês" },
    { title: "Monitoramento de Obra com Câmeras e IA", description: "Instale câmeras com análise de IA para monitoramento de segurança, avanço físico e uso de EPIs, sem precisar de supervisor presencial todo o tempo.", steps: ["Instale câmeras IP estratégicas nos pontos críticos do canteiro", "Configure plataforma de video analytics (Hikvision AI ou similar)", "Ative detecção de EPI obrigatório (capacete, colete, bota)", "Configure alertas de acesso em áreas proibidas e horários fora do padrão", "Gere relatório semanal de conformidade de segurança para o cliente"], tool: "Hikvision AI / Dahua AI", time: "2 semanas", impact: "Redução de 60% em acidentes de trabalho", difficulty: "intermediario", area: "infra", cost: "R$500-2.000/mês" },
  ],
};

const SECTOR_TABS: Array<{ key: string; label: string; emoji: string }> = [
  { key: "geral", label: "Geral", emoji: "★" },
  { key: "varejo", label: "Varejo", emoji: "🛒" },
  { key: "servicos", label: "Serviços", emoji: "⚙" },
  { key: "industria", label: "Indústria", emoji: "🏭" },
  { key: "saude", label: "Saúde", emoji: "🏥" },
  { key: "educacao", label: "Educação", emoji: "📚" },
  { key: "financeiro", label: "Financeiro", emoji: "💳" },
  { key: "agronegocio", label: "Agronegócio", emoji: "🌾" },
  { key: "logistica", label: "Logística", emoji: "🚚" },
  { key: "construcao", label: "Construção", emoji: "🏗" },
];

const AREA_COLORS: Record<string, string> = {
  infra: "#4da6ff", process: "#00b8d4", ai: "#00e5c8",
  data: "#f5c842", sales: "#00c896", service: "#7a9ec8",
};
const AREA_LABELS: Record<string, string> = {
  infra: "Infraestrutura", process: "Processos", ai: "IA & Automação",
  data: "Dados", sales: "Vendas", service: "Atendimento",
};

const DIFF_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  iniciante: { label: "Iniciante", color: "#00c896", bg: "rgba(0,200,150,.12)" },
  intermediario: { label: "Intermediário", color: "#f5c842", bg: "rgba(245,200,66,.12)" },
  avancado: { label: "Avançado", color: "#ff4055", bg: "rgba(255,64,85,.12)" },
};

function resolveSectorKey(sector?: string): string {
  if (!sector) return "geral";
  const s = sector.toLowerCase();
  if (s.includes("varejo") || s.includes("retail") || s.includes("loja")) return "varejo";
  if (s.includes("servico") || s.includes("consultoria") || s.includes("agencia")) return "servicos";
  if (s.includes("industria") || s.includes("manufatura") || s.includes("fabrica")) return "industria";
  if (s.includes("saude") || s.includes("clinica") || s.includes("hospital") || s.includes("medic")) return "saude";
  if (s.includes("educa") || s.includes("escola") || s.includes("ensino") || s.includes("curso")) return "educacao";
  if (s.includes("financ") || s.includes("banco") || s.includes("credito") || s.includes("seguro")) return "financeiro";
  if (s.includes("agro") || s.includes("fazenda") || s.includes("agricul")) return "agronegocio";
  if (s.includes("logist") || s.includes("transporte") || s.includes("entrega")) return "logistica";
  if (s.includes("constru") || s.includes("civil") || s.includes("obra") || s.includes("imobil")) return "construcao";
  return "geral";
}

function PlaybooksSection({ sector, isPremium }: { sector?: string; isPremium: boolean }) {
  const defaultTab = resolveSectorKey(sector);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [diffFilter, setDiffFilter] = useState<string>("all");

  const sectorPlaybooks = PLAYBOOKS[activeTab] || PLAYBOOKS.geral;

  const allVisible = sectorPlaybooks.filter(pb => {
    const matchSearch = !search || pb.title.toLowerCase().includes(search.toLowerCase()) || pb.description.toLowerCase().includes(search.toLowerCase());
    const matchDiff = diffFilter === "all" || pb.difficulty === diffFilter;
    return matchSearch && matchDiff;
  });

  // Free plan: 3 playbooks from recommended sector only
  const visiblePlaybooks = isPremium ? allVisible : allVisible.slice(0, 3);
  const lockedCount = isPremium ? 0 : Math.max(0, allVisible.length - 3);

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 22, color: "#f4f8ff", fontWeight: 400, marginBottom: 4 }}>
          Biblioteca de Playbooks
        </h2>
        <p style={{ fontSize: 13, color: "#7a9ec8" }}>
          {Object.values(PLAYBOOKS).flat().length} playbooks práticos e passo a passo para implementar IA no seu negócio.
          {sector && <span style={{ color: "#4da6ff" }}> Curadoria recomendada para: <strong>{sector}</strong>.</span>}
        </p>
      </div>

      {/* Sector tabs — scrollable */}
      <div style={{ overflowX: "auto", marginBottom: 20, paddingBottom: 2 }}>
        <div style={{ display: "flex", gap: 6, minWidth: "max-content" }}>
          {SECTOR_TABS.map(t => {
            const count = (PLAYBOOKS[t.key] || []).length;
            const isActive = activeTab === t.key;
            const isRecommended = t.key === defaultTab && t.key !== "geral";
            return (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setOpenId(null); setSearch(""); setDiffFilter("all"); }}
                style={{ display: "flex", alignItems: "center", gap: 6, background: isActive ? "rgba(26,127,240,.15)" : "transparent", border: `1px solid ${isActive ? "#1a7ff0" : "#1e3a5f"}`, borderRadius: 10, padding: "7px 14px", color: isActive ? "#f4f8ff" : "#4a6fa0", fontSize: 13, fontWeight: isActive ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all .15s", whiteSpace: "nowrap", position: "relative" as const }}
              >
                <span style={{ fontSize: 14 }}>{t.emoji}</span>
                {t.label}
                <span style={{ background: isActive ? "#1a7ff0" : "#1a3355", borderRadius: 99, padding: "1px 6px", fontSize: 10, fontWeight: 700, color: isActive ? "#fff" : "#4a6fa0" }}>{count}</span>
                {isRecommended && (
                  <span style={{ position: "absolute", top: -6, right: -6, background: "#00e5c8", borderRadius: 99, width: 10, height: 10, border: "2px solid #040812" }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + filter bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative" as const, flex: 1, minWidth: 200 }}>
          <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a6fa0" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            placeholder="Buscar playbooks..."
            value={search}
            onChange={e => { setSearch(e.target.value); setOpenId(null); }}
            style={{ width: "100%", background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 10, padding: "9px 12px 9px 34px", color: "#f4f8ff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "iniciante", "intermediario", "avancado"] as const).map(d => {
            const cfg = d === "all" ? { label: "Todos", color: "#4da6ff", bg: "rgba(26,127,240,.12)" } : DIFF_CONFIG[d];
            const isActive = diffFilter === d;
            return (
              <button key={d} onClick={() => setDiffFilter(d)} style={{ background: isActive ? cfg.bg : "transparent", border: `1px solid ${isActive ? cfg.color : "#1e3a5f"}`, borderRadius: 8, padding: "7px 12px", color: isActive ? cfg.color : "#4a6fa0", fontSize: 12, fontWeight: isActive ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all .15s", whiteSpace: "nowrap" }}>
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "#4a6fa0" }}>
          <span style={{ color: "#f4f8ff", fontWeight: 700 }}>{visiblePlaybooks.length}</span> playbook{visiblePlaybooks.length !== 1 ? "s" : ""} exibido{visiblePlaybooks.length !== 1 ? "s" : ""}
          {!isPremium && lockedCount > 0 && <span style={{ color: "#4a6fa0" }}> &middot; +{lockedCount} bloqueado{lockedCount !== 1 ? "s" : ""}</span>}
        </div>
      </div>

      {/* Playbook list */}
      {visiblePlaybooks.length === 0 ? (
        <div style={{ background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#4a6fa0" }}>Nenhum playbook encontrado para essa busca.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visiblePlaybooks.map((pb, i) => {
            const id = `${activeTab}-${i}`;
            const isOpen = openId === id;
            const diff = DIFF_CONFIG[pb.difficulty];
            const areaColor = AREA_COLORS[pb.area] || "#4da6ff";
            const areaLabel = AREA_LABELS[pb.area] || pb.area;
            return (
              <div key={id} style={{ background: "#0d1d35", border: `1px solid ${isOpen ? "#1a7ff0" : "#1e3a5f"}`, borderRadius: 12, overflow: "hidden", transition: "border-color .2s" }}>
                <button
                  onClick={() => setOpenId(isOpen ? null : id)}
                  style={{ width: "100%", background: "none", border: "none", padding: "18px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", textAlign: "left", gap: 16 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#f4f8ff" }}>{pb.title}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                      <span style={{ background: diff.bg, border: `1px solid ${diff.color}44`, borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: diff.color }}>{diff.label}</span>
                      <span style={{ background: `${areaColor}14`, border: `1px solid ${areaColor}30`, borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: areaColor }}>{areaLabel}</span>
                      <span style={{ fontSize: 11, color: "#4a6fa0" }}>{pb.tool}</span>
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: "#7a9ec8", display: "flex", alignItems: "center", gap: 4 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {pb.time}
                      </span>
                      <span style={{ fontSize: 11, color: "#00c896", fontWeight: 600 }}>{pb.impact}</span>
                      <span style={{ fontSize: 11, color: "#4a6fa0" }}>{pb.cost}</span>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, marginTop: 2, width: 26, height: 26, borderRadius: 7, background: isOpen ? "rgba(26,127,240,.2)" : "#102240", border: `1px solid ${isOpen ? "#1a7ff0" : "#1a3355"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", transform: isOpen ? "rotate(45deg)" : "none" }}>
                    <svg width="12" height="12" viewBox="0 0 12 12"><line x1="6" y1="1" x2="6" y2="11" stroke={isOpen ? "#4da6ff" : "#4a6fa0"} strokeWidth="1.5" /><line x1="1" y1="6" x2="11" y2="6" stroke={isOpen ? "#4da6ff" : "#4a6fa0"} strokeWidth="1.5" /></svg>
                  </div>
                </button>
                {isOpen && (
                  <div style={{ padding: "0 20px 20px", borderTop: "1px solid #1e3a5f" }}>
                    <p style={{ fontSize: 14, color: "#c8daf0", lineHeight: 1.75, margin: "16px 0 20px" }}>{pb.description}</p>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#4da6ff", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Passo a Passo</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                      {pb.steps.map((step, si) => (
                        <div key={si} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: "rgba(26,127,240,.15)", border: "1px solid rgba(26,127,240,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#4da6ff" }}>{si + 1}</div>
                          <div style={{ fontSize: 13, color: "#c8daf0", lineHeight: 1.65, paddingTop: 3 }}>{step}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ background: "rgba(0,229,200,.08)", border: "1px solid rgba(0,229,200,.2)", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#00e5c8" }}>
                        <strong>Ferramenta:</strong> {pb.tool}
                      </div>
                      <div style={{ background: "rgba(26,127,240,.08)", border: "1px solid rgba(26,127,240,.2)", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#4da6ff" }}>
                        <strong>Tempo:</strong> {pb.time}
                      </div>
                      <div style={{ background: "rgba(0,200,150,.08)", border: "1px solid rgba(0,200,150,.2)", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#00c896" }}>
                        <strong>Impacto:</strong> {pb.impact}
                      </div>
                      <div style={{ background: "rgba(245,200,66,.08)", border: "1px solid rgba(245,200,66,.2)", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#f5c842" }}>
                        <strong>Custo:</strong> {pb.cost}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lock wall for free plan */}
      {!isPremium && lockedCount > 0 && (
        <div style={{ marginTop: 16, padding: "28px 24px", background: "rgba(26,127,240,.04)", border: "1px dashed rgba(26,127,240,.2)", borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f4f8ff", marginBottom: 6 }}>
            +{lockedCount} playbooks bloqueados neste setor
          </div>
          <div style={{ fontSize: 13, color: "#7a9ec8", marginBottom: 0 }}>
            Acesse todos os {Object.values(PLAYBOOKS).flat().length} playbooks de todos os setores com o plano <strong style={{ color: "#4da6ff" }}>Premium</strong>.
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "64px 24px", background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 14 }}>
      <div style={{ width: 64, height: 64, background: "rgba(26,127,240,.1)", border: "1px solid rgba(26,127,240,.2)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <FileText size={28} color="#4da6ff" />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#f4f8ff", marginBottom: 8 }}>Nenhum relatório ainda</div>
      <div style={{ fontSize: 14, color: "#7a9ec8", marginBottom: 24, maxWidth: 380, margin: "0 auto 24px" }}>
        Complete um diagnóstico gratuito para receber seu relatório personalizado de maturidade em IA.
      </div>
      <a href="/diagnostico.html" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#1a7ff0,#00b8d4)", color: "#fff", padding: "12px 28px", borderRadius: 10, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
        Começar diagnóstico gratuito
      </a>
    </div>
  );
}

/* ─── Goals / Metas ─── */

interface Goal {
  id: string;
  title: string;
  description: string;
  category: string;
  due_date: string | null;
  priority: "alta" | "media" | "baixa";
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

const CATEGORIES: Record<string, { label: string; color: string }> = {
  infra: { label: "Infraestrutura", color: "#4da6ff" },
  process: { label: "Processos", color: "#00b8d4" },
  ai: { label: "IA & Automação", color: "#00e5c8" },
  data: { label: "Dados", color: "#f5c842" },
  sales: { label: "Vendas", color: "#00c896" },
  service: { label: "Atendimento", color: "#4da6ff" },
  geral: { label: "Geral", color: "#7a9ec8" },
};

const PRIORITIES: Record<string, { label: string; color: string }> = {
  alta: { label: "Alta", color: "#ff4055" },
  media: { label: "Média", color: "#f5c842" },
  baixa: { label: "Baixa", color: "#00c896" },
};

function GoalsSection({ userId, latestReport }: { userId: string; latestReport: ReportItem | null }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "done">("all");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "geral",
    priority: "media" as "alta" | "media" | "baixa",
    due_date: "",
  });

  // Derive suggested goals from quick_wins in the latest report
  const suggestedGoals = (latestReport?.ai_data?.quick_wins || []).slice(0, 3).map((w, i) => ({
    id: `suggested-${i}`,
    title: (w as { title: string }).title,
    category: (w as { area?: string }).area || "geral",
    priority: i === 0 ? "alta" : "media",
  }));

  async function loadGoals() {
    setLoading(true);
    const { data } = await supabase
      .from("user_goals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setGoals((data as Goal[]) || []);
    setLoading(false);
  }

  useEffect(() => { loadGoals(); }, [userId]);

  async function handleAddGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const { data } = await supabase.from("user_goals").insert({
      user_id: userId,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      priority: form.priority,
      due_date: form.due_date || null,
    }).select().maybeSingle();
    if (data) setGoals(prev => [data as Goal, ...prev]);
    setForm({ title: "", description: "", category: "geral", priority: "media", due_date: "" });
    setShowForm(false);
    setSaving(false);
  }

  async function handleAddSuggested(s: { title: string; category: string; priority: string }) {
    setSaving(true);
    const { data } = await supabase.from("user_goals").insert({
      user_id: userId,
      title: s.title,
      description: "",
      category: s.category,
      priority: s.priority,
    }).select().maybeSingle();
    if (data) setGoals(prev => [data as Goal, ...prev]);
    setSaving(false);
  }

  async function toggleGoal(goal: Goal) {
    const newCompleted = !goal.completed;
    setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null } : g));
    await supabase.from("user_goals").update({
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    }).eq("id", goal.id);
  }

  async function deleteGoal(id: string) {
    setDeletingId(id);
    await supabase.from("user_goals").delete().eq("id", id);
    setGoals(prev => prev.filter(g => g.id !== id));
    setDeletingId(null);
  }

  const filtered = goals.filter(g => {
    const catMatch = filterCat === "all" || g.category === filterCat;
    const statusMatch = filterStatus === "all" || (filterStatus === "open" ? !g.completed : g.completed);
    return catMatch && statusMatch;
  });

  const openCount = goals.filter(g => !g.completed).length;
  const doneCount = goals.filter(g => g.completed).length;
  const totalCount = goals.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const alreadyAdded = new Set(goals.map(g => g.title));

  const pillStyle = (active: boolean, color = "#1a7ff0") => ({
    background: active ? `${color}22` : "transparent",
    border: `1px solid ${active ? color : "#1e3a5f"}`,
    borderRadius: 99,
    padding: "4px 14px",
    fontSize: 12,
    fontWeight: active ? 700 : 400,
    color: active ? color : "#4a6fa0",
    cursor: "pointer" as const,
    fontFamily: "inherit",
    transition: "all .15s",
  });

  return (
    <div className="fade-in">
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 22, color: "#f4f8ff", fontWeight: 400, marginBottom: 4 }}>
            Metas & Checklist
          </h2>
          <p style={{ fontSize: 13, color: "#7a9ec8" }}>
            Defina e acompanhe suas metas de transformação digital.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#1a7ff0,#00b8d4)", border: "none", borderRadius: 10, padding: "10px 20px", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}
        >
          <Plus size={16} /> Nova Meta
        </button>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div style={{ background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 14, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f4f8ff" }}>Progresso Geral</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: pct === 100 ? "#00c896" : "#4da6ff" }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: "#1a3355", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#00c896" : "linear-gradient(90deg,#1a7ff0,#00b8d4)", borderRadius: 4, transition: "width .5s ease" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            {[
              { val: openCount, label: "Abertas", color: "#4da6ff" },
              { val: doneCount, label: "Concluídas", color: "#00c896" },
              { val: totalCount, label: "Total", color: "#7a9ec8" },
            ].map(({ val, label, color }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, color: "#4a6fa0", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAddGoal} style={{ background: "#0d1d35", border: "1px solid #1a7ff0", borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#4da6ff", marginBottom: 16, letterSpacing: ".05em", textTransform: "uppercase" }}>Nova Meta</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              required
              placeholder="Título da meta *"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ background: "#102240", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 14px", color: "#f4f8ff", fontSize: 14, fontFamily: "inherit", outline: "none" }}
            />
            <textarea
              placeholder="Descrição (opcional)"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              style={{ background: "#102240", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 14px", color: "#f4f8ff", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                style={{ background: "#102240", border: "1px solid #1e3a5f", borderRadius: 8, padding: "8px 12px", color: "#f4f8ff", fontSize: 13, fontFamily: "inherit", flex: 1, minWidth: 140 }}
              >
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value as "alta" | "media" | "baixa" }))}
                style={{ background: "#102240", border: "1px solid #1e3a5f", borderRadius: 8, padding: "8px 12px", color: "#f4f8ff", fontSize: 13, fontFamily: "inherit", flex: 1, minWidth: 120 }}
              >
                {Object.entries(PRIORITIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label} Prioridade</option>
                ))}
              </select>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                style={{ background: "#102240", border: "1px solid #1e3a5f", borderRadius: 8, padding: "8px 12px", color: form.due_date ? "#f4f8ff" : "#4a6fa0", fontSize: 13, fontFamily: "inherit", flex: 1, minWidth: 140 }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ background: "none", border: "1px solid #1e3a5f", borderRadius: 8, padding: "8px 18px", color: "#7a9ec8", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Cancelar
              </button>
              <button type="submit" disabled={saving} style={{ background: "linear-gradient(135deg,#1a7ff0,#00b8d4)", border: "none", borderRadius: 8, padding: "8px 22px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Salvando..." : "Adicionar Meta"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Suggested from quick wins */}
      {suggestedGoals.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <Target size={12} /> Sugestões do seu último relatório
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {suggestedGoals.map(s => {
              const already = alreadyAdded.has(s.title);
              const cat = CATEGORIES[s.category] || CATEGORIES.geral;
              return (
                <button
                  key={s.id}
                  disabled={already || saving}
                  onClick={() => handleAddSuggested(s)}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: already ? "rgba(0,200,150,.06)" : "rgba(26,127,240,.08)", border: `1px solid ${already ? "rgba(0,200,150,.25)" : "rgba(26,127,240,.2)"}`, borderRadius: 99, padding: "6px 14px", fontSize: 12, color: already ? "#00c896" : "#4da6ff", cursor: already ? "default" : "pointer", fontFamily: "inherit", transition: "all .15s" }}
                >
                  {already ? <Check size={12} /> : <Plus size={12} />}
                  <span style={{ color: cat.color, fontWeight: 700 }}>{cat.label}</span>
                  <span style={{ color: already ? "#00c896" : "#c8daf0" }}>{s.title}</span>
                  {already && <span style={{ color: "#00c896", fontSize: 11 }}>Adicionada</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "open", "done"] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={pillStyle(filterStatus === s)}>
              {s === "all" ? "Todas" : s === "open" ? "Abertas" : "Concluídas"}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: "#1e3a5f" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setFilterCat("all")} style={pillStyle(filterCat === "all")}>Todas as áreas</button>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <button key={k} onClick={() => setFilterCat(k)} style={pillStyle(filterCat === k, v.color)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Goals list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#4a6fa0" }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 14, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, background: "rgba(26,127,240,.1)", border: "1px solid rgba(26,127,240,.2)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Target size={24} color="#4da6ff" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f4f8ff", marginBottom: 6 }}>
            {goals.length === 0 ? "Nenhuma meta ainda" : "Nenhuma meta encontrada"}
          </div>
          <div style={{ fontSize: 13, color: "#7a9ec8", maxWidth: 320, margin: "0 auto 20px" }}>
            {goals.length === 0
              ? "Crie suas primeiras metas ou adicione sugestões do seu último relatório."
              : "Tente ajustar os filtros para ver mais metas."}
          </div>
          {goals.length === 0 && (
            <button onClick={() => setShowForm(true)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#1a7ff0,#00b8d4)", border: "none", borderRadius: 10, padding: "10px 24px", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <Plus size={16} /> Criar Primeira Meta
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(goal => {
            const cat = CATEGORIES[goal.category] || CATEGORIES.geral;
            const pri = PRIORITIES[goal.priority] || PRIORITIES.media;
            const isOverdue = goal.due_date && !goal.completed && new Date(goal.due_date) < new Date();
            const isDeleting = deletingId === goal.id;
            return (
              <div
                key={goal.id}
                style={{ background: "#0d1d35", border: `1px solid ${goal.completed ? "#1a3355" : "#1e3a5f"}`, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14, transition: "all .2s", opacity: isDeleting ? 0.4 : 1 }}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleGoal(goal)}
                  style={{ flexShrink: 0, marginTop: 2, width: 20, height: 20, borderRadius: 6, border: `2px solid ${goal.completed ? "#00c896" : "#1e3a5f"}`, background: goal.completed ? "#00c896" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all .2s" }}
                >
                  {goal.completed && <Check size={12} color="#040812" strokeWidth={3} />}
                </button>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: goal.completed ? "#4a6fa0" : "#f4f8ff", textDecoration: goal.completed ? "line-through" : "none", transition: "all .2s" }}>
                      {goal.title}
                    </span>
                    <span style={{ display: "inline-block", background: `${cat.color}18`, border: `1px solid ${cat.color}44`, borderRadius: 99, padding: "1px 8px", fontSize: 10, fontWeight: 700, color: cat.color, letterSpacing: ".05em" }}>
                      {cat.label}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: `${pri.color}14`, border: `1px solid ${pri.color}30`, borderRadius: 99, padding: "1px 7px", fontSize: 10, fontWeight: 700, color: pri.color }}>
                      <Flag size={8} /> {pri.label}
                    </span>
                  </div>
                  {goal.description && (
                    <div style={{ fontSize: 12, color: "#7a9ec8", marginBottom: 6, lineHeight: 1.6 }}>{goal.description}</div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    {goal.due_date && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: isOverdue ? "#ff4055" : "#4a6fa0", fontWeight: isOverdue ? 700 : 400 }}>
                        <Calendar size={10} />
                        {isOverdue && !goal.completed ? "Atrasada — " : ""}
                        {new Date(goal.due_date).toLocaleDateString("pt-BR")}
                      </div>
                    )}
                    {goal.completed && goal.completed_at && (
                      <div style={{ fontSize: 11, color: "#00c896", display: "flex", alignItems: "center", gap: 4 }}>
                        <Check size={10} /> Concluída em {new Date(goal.completed_at).toLocaleDateString("pt-BR")}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#2a4a70" }}>
                      Criada em {new Date(goal.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteGoal(goal.id)}
                  disabled={isDeleting}
                  style={{ flexShrink: 0, background: "none", border: "none", cursor: isDeleting ? "not-allowed" : "pointer", color: "#1e3a5f", padding: 4, borderRadius: 6, display: "flex", alignItems: "center", transition: "color .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#ff4055")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#1e3a5f")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EvolucaoUpsell({ userEmail }: { userEmail: string }) {
  const [loading, setLoading] = useState(false);

  async function handleEvolucao() {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          plan: "subscription",
          email: userEmail,
          success_url: `${window.location.origin}/obrigado.html`,
          cancel_url: window.location.href,
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      alert("Erro ao iniciar checkout. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 40, background: "linear-gradient(135deg, #0d1d35 0%, #0a1628 100%)", border: "1px solid #1e3a5f", borderRadius: 16, padding: "32px 28px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 50% 60% at 90% 50%, rgba(0,229,200,.05) 0%, transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,229,200,.1)", border: "1px solid rgba(0,229,200,.2)", borderRadius: 99, padding: "4px 12px", fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#00e5c8", marginBottom: 12 }}>
            <Star size={11} /> Plano Evolução
          </div>
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: 22, color: "#f4f8ff", fontWeight: 400, marginBottom: 8 }}>
            Desbloqueie o acompanhamento contínuo
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginBottom: 4 }}>
            {["Auditoria de processos detalhada", "Gaps críticos identificados", "Histórico de evolução", "Relatórios ilimitados", "Suporte prioritário"].map(f => (
              <div key={f} style={{ fontSize: 13, color: "#7a9ec8", display: "flex", alignItems: "center", gap: 5 }}>
                <Check size={13} strokeWidth={2} style={{ color: "#00e5c8", flexShrink: 0 }} /> {f}
              </div>
            ))}
          </div>
        </div>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <button
            onClick={handleEvolucao}
            disabled={loading}
            className="btn-hover"
            style={{ background: "linear-gradient(135deg,#1a7ff0,#00b8d4)", border: "none", borderRadius: 10, padding: "14px 28px", color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, fontFamily: "inherit", transition: "all .2s", boxShadow: "0 10px 32px rgba(26,127,240,.3)", whiteSpace: "nowrap" }}
          >
            {loading ? "Aguarde..." : "Assinar Evolução"}
          </button>
          <div style={{ fontSize: 12, color: "#4a6fa0", marginTop: 8 }}>Cancele quando quiser</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Report Viewer Modal ─── */

function ReportViewerModal({ report, profile, onClose }: { report: ReportItem; profile: UserProfile | null; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const html = buildPrintHtml(report, profile);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.onload = () => {};
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  function handlePrint() {
    iframeRef.current?.contentWindow?.print();
  }

  // Close on backdrop click
  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      onClick={onBackdrop}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(2,6,18,.85)",
        backdropFilter: "blur(4px)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
        padding: "24px 16px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 800,
          background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 16,
          display: "flex", flexDirection: "column",
          boxShadow: "0 32px 80px rgba(0,0,0,.6)",
          maxHeight: "calc(100vh - 48px)",
        }}
      >
        {/* Modal header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #1e3a5f",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f4f8ff" }}>Relatório completo</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handlePrint}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "linear-gradient(135deg,#1a7ff0,#00b8d4)", border: "none",
                borderRadius: 8, padding: "8px 16px", color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Download size={13} /> Imprimir / Salvar PDF
            </button>
            <button
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32,
                background: "#102240", border: "1px solid #1e3a5f",
                borderRadius: 8, color: "#7a9ec8", cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* iframe content */}
        <iframe
          ref={iframeRef}
          title="Relatório completo"
          style={{
            flex: 1,
            width: "100%",
            minHeight: 600,
            border: "none",
            borderRadius: "0 0 16px 16px",
            background: "#fff",
          }}
        />
      </div>
    </div>
  );
}

/* ─── Print HTML builder ─── */

function buildPrintHtml(report: ReportItem, profile: UserProfile | null): string {
  const ai = report.ai_data || {};
  // Normalise both report_data-joined and _fromDiag shapes
  const diag = report._fromDiag
    ? { global_score: report.global_score ?? 0, maturity_level: report.maturity_level ?? 0, sector: report.sector ?? "", area_scores: report.area_scores ?? {} }
    : report.diagnostic_responses;
  const score = diag?.global_score ?? 0;
  const scoreColor = score >= 61 ? "#00c896" : score >= 41 ? "#f5c842" : "#ff4055";
  const maturity = MATURITY[diag?.maturity_level ?? 0] || "";

  const benchmark = (ai as { benchmark?: { sector_avg_score?: number; position?: string; sector_context?: string; area_comparison?: Record<string, { company: number; sector_avg: number }> } }).benchmark;
  const areaComparison = benchmark?.area_comparison || {};

  const areaRows = diag?.area_scores
    ? Object.entries(diag.area_scores).map(([k, v]) => {
        const c = v >= 61 ? "#00c896" : v >= 41 ? "#f5c842" : "#ff4055";
        const avg = areaComparison[k]?.sector_avg ?? null;
        const diff = avg !== null ? Math.round(v - avg) : null;
        const diffStr = diff !== null ? ` <span style="font-size:11px;color:${diff >= 0 ? "#2e7d32" : "#c62828"};">(${diff >= 0 ? "+" : ""}${diff} vs setor)</span>` : "";
        return `<tr><td style="padding:6px 8px;font-size:13px;">${AREA_PT[k] || k}</td><td style="padding:6px 8px;width:200px;"><div style="background:#e0e7ef;border-radius:4px;height:8px;overflow:hidden;position:relative;"><div style="width:${v}%;height:100%;background:${c};border-radius:4px;"></div>${avg !== null ? `<div style="position:absolute;top:0;left:${avg}%;width:2px;height:100%;background:#1a7ff0;"></div>` : ""}</div></td><td style="padding:6px 8px;font-weight:700;font-size:13px;color:${c};text-align:right;white-space:nowrap;">${v}/100${diffStr}</td></tr>`;
      }).join("")
    : "";

  const benchmarkHtml = benchmark?.sector_avg_score != null ? `
    <div style="margin-top:16px;padding:14px;background:#f0f4f8;border-radius:8px;border-left:3px solid #1a7ff0;">
      <div style="font-size:11px;color:#1a7ff0;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Benchmark do Setor</div>
      <div style="display:flex;gap:24px;align-items:center;margin-bottom:8px;">
        <div><div style="font-size:22px;font-weight:700;color:#555;">${benchmark.sector_avg_score}</div><div style="font-size:11px;color:#888;">Média do setor</div></div>
        <div style="color:#ccc;font-size:18px;">vs</div>
        <div><div style="font-size:22px;font-weight:700;color:${scoreColor};">${score}</div><div style="font-size:11px;color:#888;">Sua empresa</div></div>
        <div style="background:${benchmark.position === "acima" ? "#e8f5e9" : benchmark.position === "abaixo" ? "#ffebee" : "#fff8e1"};border-radius:99px;padding:4px 14px;font-size:12px;font-weight:700;color:${benchmark.position === "acima" ? "#2e7d32" : benchmark.position === "abaixo" ? "#c62828" : "#f57f17"};">${benchmark.position === "acima" ? "Acima da média" : benchmark.position === "abaixo" ? "Abaixo da média" : "Na média"}</div>
      </div>
      ${benchmark.sector_context ? `<div style="font-size:12px;color:#666;line-height:1.6;">${benchmark.sector_context}</div>` : ""}
      <div style="font-size:10px;color:#aaa;margin-top:6px;">Linha azul nas barras = média do setor</div>
    </div>` : "";

  const qwHtml = ((ai as { quick_wins?: Array<{ title: string; description: string; tool: string; tool_cost: string; impact: string }> }).quick_wins || []).map((w, i) => `
    <div style="margin-bottom:12px;padding:14px;background:#f0f4f8;border-radius:8px;border-left:3px solid #1a7ff0;">
      <div style="font-size:11px;color:#1a7ff0;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Quick Win ${i+1}</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;">${w.title}</div>
      <div style="font-size:13px;color:#555;margin-bottom:6px;">${w.description}</div>
      <div style="font-size:12px;color:#1a7ff0;">${w.tool} — ${w.tool_cost}</div>
      <div style="font-size:12px;color:#666;margin-top:4px;"><strong>Impacto:</strong> ${w.impact}</div>
    </div>`).join("");

  const roadmap = (ai as { roadmap?: Record<string, { title: string; subtitle: string; actions: Array<{ title: string; description: string; tool: string }> }> }).roadmap || {};
  const roadmapHtml = ["d30", "d60", "d90"].map((p, i) => {
    const ph = roadmap[p];
    if (!ph) return "";
    const label = ["30 dias", "60 dias", "90 dias"][i];
    const acts = (ph.actions || []).map(a => `<div style="margin-bottom:8px;padding:10px;background:#f8fafc;border-left:2px solid #90caf9;border-radius:0 6px 6px 0;"><div style="font-size:13px;font-weight:600;">${a.title}</div><div style="font-size:12px;color:#666;">${a.description}</div>${a.tool ? `<div style="font-size:11px;color:#1a7ff0;margin-top:3px;">Ferramenta: ${a.tool}</div>` : ""}</div>`).join("");
    return `<div style="margin-bottom:20px;"><div style="font-size:11px;color:#1a7ff0;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Fase ${label}</div><div style="font-size:16px;font-weight:700;margin-bottom:4px;">${ph.title}</div><div style="font-size:13px;color:#666;margin-bottom:10px;">${ph.subtitle}</div>${acts}</div>`;
  }).join("");

  const gaps = (ai as { gaps?: Array<{ area: string; title: string; severity: string; metric: string }> }).gaps || [];
  const gapsHtml = gaps.map(g => {
    const sc = g.severity === "critico" ? "#c62828" : g.severity === "importante" ? "#e65100" : "#f57f17";
    return `<div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:8px;padding:12px;background:#f0f4f8;border-radius:8px;border-left:3px solid ${sc};"><div style="flex-shrink:0;padding:2px 8px;border-radius:4px;background:${sc}22;font-size:11px;font-weight:700;color:${sc};text-transform:capitalize;white-space:nowrap;">${g.severity}</div><div><div style="font-size:13px;font-weight:600;">${AREA_PT[g.area] || g.area} — ${g.title}</div><div style="font-size:12px;color:#666;margin-top:2px;">${g.metric}</div></div></div>`;
  }).join("");

  const pa = (ai as { process_audit?: { process_name: string; current_state: string; automation_potential: number; hours_saved_week: number; money_saved_month: string; steps: Array<{ label: string; status: string; fix: string }> } }).process_audit;
  const paHtml = pa ? `
    <h2>Auditoria do Processo Crítico</h2>
    <div style="background:#f0f4f8;border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="font-size:15px;font-weight:700;margin-bottom:6px;">${pa.process_name}</div>
      <div style="font-size:13px;color:#555;margin-bottom:14px;">${pa.current_state}</div>
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:#00897b;">${pa.automation_potential}%</div><div style="font-size:11px;color:#888;">Potencial de automação</div></div>
        <div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:#1a7ff0;">${pa.hours_saved_week}h</div><div style="font-size:11px;color:#888;">Horas salvas/semana</div></div>
        <div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:#f57f17;">R$${pa.money_saved_month}</div><div style="font-size:11px;color:#888;">Economia mensal</div></div>
      </div>
    </div>
    ${(pa.steps || []).map(s => {
      const sc = s.status === "automated" ? "#2e7d32" : s.status === "partial" ? "#f57f17" : "#c62828";
      const sl = s.status === "automated" ? "Automatizado" : s.status === "partial" ? "Parcial" : "Manual";
      return `<div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:8px;padding:10px;background:#f8fafc;border-radius:6px;"><div style="flex-shrink:0;padding:2px 8px;border-radius:4px;background:${sc}22;font-size:11px;font-weight:700;color:${sc};white-space:nowrap;">${sl}</div><div><div style="font-size:13px;font-weight:600;">${s.label}</div><div style="font-size:12px;color:#666;margin-top:2px;">${s.fix}</div></div></div>`;
    }).join("")}` : "";

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório MapeIA</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#111;line-height:1.6;padding:40px;}
    h1{font-family:Georgia,serif;font-size:28px;margin-bottom:4px;}
    h2{font-family:Georgia,serif;font-size:18px;font-weight:400;margin:24px 0 12px;}
    .badge{display:inline-block;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:99px;padding:4px 14px;font-size:12px;font-weight:700;color:#2e7d32;margin-bottom:16px;}
    table{width:100%;border-collapse:collapse;}
    @media print{button{display:none!important}}
  </style>
  </head><body>
  <button onclick="window.print()" style="float:right;padding:8px 18px;background:#1a7ff0;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;margin-bottom:16px;">Imprimir / Salvar PDF</button>
  <div style="max-width:720px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #e0e7ef;">
      <h1>MapeIA <span style="color:#00b8d4;">Brasil</span></h1>
      <div style="font-size:12px;color:#888;letter-spacing:.1em;text-transform:uppercase;">Relatório de Maturidade em IA</div>
    </div>
    <div style="background:#f0f4f8;border-radius:10px;padding:20px;margin-bottom:24px;">
      <div style="font-size:11px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Empresa Analisada</div>
      <div style="font-size:18px;font-weight:700;">${profile?.company || profile?.name || "Empresa"}</div>
      <div style="font-size:13px;color:#666;">Setor: ${diag?.sector || ""} &middot; Gerado em: ${new Date(report.created_at).toLocaleDateString("pt-BR")}</div>
    </div>
    <div style="text-align:center;background:#f0f4f8;border-radius:10px;padding:24px;margin-bottom:24px;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;">Score Global</div>
      <div style="font-size:64px;font-weight:700;color:${scoreColor};line-height:1;">${score}</div>
      <div style="font-size:13px;color:#888;">de 100 pontos</div>
      <div class="badge" style="margin-top:12px;">Nível ${diag?.maturity_level ?? ""}/5 — ${maturity}</div>
      ${(ai as { level_description?: string }).level_description ? `<p style="margin-top:12px;font-size:14px;color:#444;max-width:480px;margin-left:auto;margin-right:auto;">${(ai as { level_description?: string }).level_description}</p>` : ""}
    </div>
    ${areaRows ? `<h2>Score por Área vs Média do Setor</h2><table>${areaRows}</table>${benchmarkHtml}` : ""}
    <h2>Quick Wins Priorizados</h2>
    ${qwHtml || "<p style='color:#888;'>Não disponível.</p>"}
    ${roadmapHtml ? `<h2>Roadmap 30/60/90 Dias</h2>${roadmapHtml}` : ""}
    ${gapsHtml ? `<h2>Gaps Críticos Identificados</h2>${gapsHtml}` : ""}
    ${paHtml}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e0e7ef;text-align:center;font-size:11px;color:#aaa;">
      Relatório gerado por MapeIA Brasil — mapeiabrasil.com &nbsp;|&nbsp; Dúvidas: servicoaocliente@mapeiabrasil.com &nbsp;|&nbsp; Confidencial para uso exclusivo do destinatário.
    </div>
  </div>
  </body></html>`;
}
