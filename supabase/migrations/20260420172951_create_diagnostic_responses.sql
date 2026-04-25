/*
  # Diagnostic Responses

  1. Nova Tabela
    - `diagnostic_responses`
      - `id` (uuid, primary key)
      - `lead_id` (uuid, fk -> leads.id, opcional) — liga o diagnostico ao lead capturado
      - `email` (text) — e-mail informado no gate (duplicado para facil busca)
      - `sector` (text) — setor escolhido no bloco 0
      - `company_size` (text) — faixa de funcionarios
      - `revenue` (text) — faixa de faturamento
      - `budget` (text) — orcamento mensal disponivel
      - `answers` (jsonb) — mapa question_id -> option_value (0-100)
      - `area_scores` (jsonb) — score por area (infraestrutura, processos, ia, dados, financeiro, vendas, atendimento)
      - `global_score` (int) — 0 a 100
      - `maturity_level` (int) — 1 a 5
      - `plan_tier` (text) — free | premium | subscription
      - `unlocked` (boolean) — false ate pagamento do premium
      - `created_at` (timestamptz)

  2. Seguranca
    - RLS habilitado
    - INSERT publico (anon + authenticated) — necessario para o fluxo gratuito
    - SEM SELECT/UPDATE/DELETE publicos — apenas service_role (edge function / admin)
*/

CREATE TABLE IF NOT EXISTS diagnostic_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  email text NOT NULL DEFAULT '',
  sector text DEFAULT '',
  company_size text DEFAULT '',
  revenue text DEFAULT '',
  budget text DEFAULT '',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  area_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  global_score int NOT NULL DEFAULT 0,
  maturity_level int NOT NULL DEFAULT 1,
  plan_tier text NOT NULL DEFAULT 'free',
  unlocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE diagnostic_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a diagnostic"
  ON diagnostic_responses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(email) > 0 AND length(email) < 320
    AND global_score BETWEEN 0 AND 100
    AND maturity_level BETWEEN 1 AND 5
    AND plan_tier IN ('free','premium','subscription')
  );

CREATE INDEX IF NOT EXISTS idx_diag_email ON diagnostic_responses (email);
CREATE INDEX IF NOT EXISTS idx_diag_created_at ON diagnostic_responses (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diag_lead ON diagnostic_responses (lead_id);
