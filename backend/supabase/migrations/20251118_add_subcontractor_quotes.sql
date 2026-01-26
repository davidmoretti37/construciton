-- Migration: Add subcontractor_quotes table for GC pricing management
-- This allows General Contractors to store multiple subcontractor quotes per trade
-- and mark preferred vendors for AI-powered estimate generation

-- Create subcontractor_quotes table
CREATE TABLE IF NOT EXISTS subcontractor_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id TEXT NOT NULL, -- e.g., 'drywall', 'electrical', 'plumbing'
  subcontractor_name TEXT NOT NULL,
  contact_phone TEXT,
  contact_email TEXT,
  is_preferred BOOLEAN DEFAULT false, -- Mark as preferred vendor
  document_url TEXT, -- Link to uploaded quote document in Supabase Storage
  services JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of pricing items
  notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX idx_subcontractor_quotes_user_id ON subcontractor_quotes(user_id);
CREATE INDEX idx_subcontractor_quotes_trade_id ON subcontractor_quotes(trade_id);
CREATE INDEX idx_subcontractor_quotes_is_preferred ON subcontractor_quotes(is_preferred);
CREATE INDEX idx_subcontractor_quotes_user_trade ON subcontractor_quotes(user_id, trade_id);

-- Enable Row Level Security
ALTER TABLE subcontractor_quotes ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own subcontractor quotes
CREATE POLICY "Users can view own subcontractor quotes"
  ON subcontractor_quotes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own subcontractor quotes
CREATE POLICY "Users can insert own subcontractor quotes"
  ON subcontractor_quotes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own subcontractor quotes
CREATE POLICY "Users can update own subcontractor quotes"
  ON subcontractor_quotes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own subcontractor quotes
CREATE POLICY "Users can delete own subcontractor quotes"
  ON subcontractor_quotes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_subcontractor_quotes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_subcontractor_quotes_updated_at
  BEFORE UPDATE ON subcontractor_quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_subcontractor_quotes_updated_at();

-- Add comment for documentation
COMMENT ON TABLE subcontractor_quotes IS 'Stores subcontractor pricing quotes for General Contractors. Supports multiple quotes per trade with preferred vendor marking.';
COMMENT ON COLUMN subcontractor_quotes.trade_id IS 'Trade category identifier matching TRADES constant (e.g., drywall, electrical, plumbing)';
COMMENT ON COLUMN subcontractor_quotes.is_preferred IS 'When true, AI will prioritize this vendor when creating estimates';
COMMENT ON COLUMN subcontractor_quotes.services IS 'JSONB array of pricing items: [{description, unit, pricePerUnit, notes}]';
COMMENT ON COLUMN subcontractor_quotes.document_url IS 'URL to uploaded quote document in Supabase Storage documents bucket';
