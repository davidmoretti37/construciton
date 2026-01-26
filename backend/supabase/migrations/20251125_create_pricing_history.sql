-- Create pricing_history table for AI-powered adaptive pricing learning
-- This table stores pricing decisions from projects, estimates, and invoices
-- to help the AI suggest prices based on similar past work

CREATE TABLE IF NOT EXISTS pricing_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- What was priced
  service_type TEXT NOT NULL,           -- e.g., 'painting', 'tile', 'carpentry'
  work_description TEXT NOT NULL,       -- e.g., 'Interior painting 3 bedrooms'

  -- Pricing details
  quantity NUMERIC(10,2),
  unit TEXT,                            -- 'sq ft', 'linear ft', 'hour', 'job'
  price_per_unit NUMERIC(10,2),
  total_amount NUMERIC(10,2) NOT NULL,

  -- Context for similarity matching
  scope_keywords TEXT[],                -- AI-extracted: ['interior', 'bedroom', 'walls']
  square_footage NUMERIC(10,2),
  complexity TEXT CHECK (complexity IN ('simple', 'moderate', 'complex')),

  -- Source tracking
  source_type TEXT NOT NULL CHECK (source_type IN ('project', 'estimate', 'invoice', 'correction')),
  source_id UUID,                       -- Reference to original record
  project_name TEXT,

  -- Learning weight
  is_correction BOOLEAN DEFAULT false,  -- True if owner edited AI suggestion
  confidence_weight NUMERIC(3,2) DEFAULT 1.0,  -- Corrections get 1.5x weight

  -- Timestamps
  work_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pricing_history_user ON pricing_history(user_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_service ON pricing_history(service_type);
CREATE INDEX IF NOT EXISTS idx_pricing_history_keywords ON pricing_history USING GIN(scope_keywords);
CREATE INDEX IF NOT EXISTS idx_pricing_history_source ON pricing_history(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_created ON pricing_history(created_at DESC);

-- Row Level Security
ALTER TABLE pricing_history ENABLE ROW LEVEL SECURITY;

-- Users can only see their own pricing history
CREATE POLICY "Users can view own pricing history"
  ON pricing_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pricing history"
  ON pricing_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pricing history"
  ON pricing_history FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pricing history"
  ON pricing_history FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pricing_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pricing_history_updated_at
  BEFORE UPDATE ON pricing_history
  FOR EACH ROW
  EXECUTE FUNCTION update_pricing_history_updated_at();

-- Comment for documentation
COMMENT ON TABLE pricing_history IS 'Stores pricing decisions for AI learning. Corrections (owner edits) are weighted 1.5x higher for future suggestions.';
