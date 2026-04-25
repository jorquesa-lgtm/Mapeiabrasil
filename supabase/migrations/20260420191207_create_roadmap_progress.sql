/*
  # Criar tabela de progresso do roadmap

  1. Nova Tabela
    - `roadmap_progress`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK auth.users)
      - `report_id` (uuid, FK report_data)
      - `phase` (text) - "d30", "d60", "d90"
      - `action_index` (integer) - indice da acao dentro da fase
      - `completed` (boolean, default false)
      - `completed_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Segurança
    - RLS habilitado
    - Usuarios so acessam seus proprios dados
*/

CREATE TABLE IF NOT EXISTS roadmap_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id uuid NOT NULL,
  phase text NOT NULL CHECK (phase IN ('d30', 'd60', 'd90')),
  action_index integer NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, report_id, phase, action_index)
);

ALTER TABLE roadmap_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own roadmap progress"
  ON roadmap_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own roadmap progress"
  ON roadmap_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own roadmap progress"
  ON roadmap_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS roadmap_progress_user_report_idx ON roadmap_progress (user_id, report_id);
