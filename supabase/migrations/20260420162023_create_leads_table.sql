/*
  # Tabela de Leads — Audit IA Brasil

  1. Nova Tabela
    - `leads`
      - `id` (uuid, primary key)
      - `name` (text) — nome do lead
      - `email` (text) — e-mail de contato
      - `whatsapp` (text, opcional) — telefone/WhatsApp com DDD
      - `company` (text, opcional) — nome da empresa
      - `sector` (text, opcional) — setor de atuacao
      - `source` (text) — de onde o lead veio (hero_cta, pricing_free, pricing_premium, final_cta)
      - `plan_interest` (text) — plano de interesse (free, premium, consultoria)
      - `created_at` (timestamptz) — data de captura
  2. Seguranca
    - RLS habilitado na tabela `leads`
    - Politica de INSERT permite captura publica (anon + authenticated) — necessario para formulario de landing page
    - SEM politica de SELECT/UPDATE/DELETE publicas — apenas service_role (admin) pode ler os leads via Dashboard do Supabase
  3. Notas
    - A leitura dos leads deve ser feita apenas pelo dono do projeto via Dashboard do Supabase ou edge function com service_role
    - Dados sensiveis (e-mail, WhatsApp) ficam protegidos contra leitura publica
*/

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  whatsapp text DEFAULT '',
  company text DEFAULT '',
  sector text DEFAULT '',
  source text NOT NULL DEFAULT 'unknown',
  plan_interest text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a lead"
  ON leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(name) > 0
    AND length(email) > 0
    AND length(email) < 320
    AND length(name) < 200
    AND length(coalesce(whatsapp,'')) < 40
    AND length(coalesce(company,'')) < 200
    AND length(coalesce(sector,'')) < 80
    AND length(source) < 80
    AND length(plan_interest) < 40
  );

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads (source);
