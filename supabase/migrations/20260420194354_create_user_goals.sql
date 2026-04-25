/*
  # User Goals (Metas/Checklist)

  Stores the goals and checklist items created by users in their dashboard.
  Each goal belongs to one user, belongs to a category (area of improvement),
  has a title, optional description, due date, and completion status.

  1. New Tables
    - `user_goals`
      - `id` (uuid, pk)
      - `user_id` (uuid, fk -> auth.users)
      - `title` (text) — short goal title
      - `description` (text) — optional detail
      - `category` (text) — e.g. "infra", "process", "ai", "data", "sales", "service", "geral"
      - `due_date` (date, nullable) — optional target date
      - `priority` (text) — "alta", "media", "baixa"
      - `completed` (boolean)
      - `completed_at` (timestamptz, nullable)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled
    - Users can only select/insert/update/delete their own goals

  3. Indexes
    - (user_id, completed) — fast filter for open vs done goals
    - (user_id, category) — filter by area
*/

CREATE TABLE IF NOT EXISTS user_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'geral',
  due_date date,
  priority text NOT NULL DEFAULT 'media',
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own goals"
  ON user_goals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goals"
  ON user_goals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals"
  ON user_goals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals"
  ON user_goals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_goals_user_completed ON user_goals (user_id, completed);
CREATE INDEX IF NOT EXISTS idx_goals_user_category ON user_goals (user_id, category);
