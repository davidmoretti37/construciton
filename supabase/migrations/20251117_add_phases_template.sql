-- Add phases_template to profiles table
-- This stores the contractor's typical project phases for fast estimate generation

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phases_template JSONB DEFAULT NULL;

-- Add comment explaining the structure
COMMENT ON COLUMN public.profiles.phases_template IS 'Contractor typical phases template:
{
  "phases": [
    {
      "name": "Rough",
      "typical_days": 14,
      "tasks": ["Framing", "Electrical rough-in", "Plumbing rough-in"],
      "typical_budget_percentage": 40
    },
    {
      "name": "Finish",
      "typical_days": 10,
      "tasks": ["Drywall", "Paint", "Trim", "Fixtures"],
      "typical_budget_percentage": 60
    }
  ]
}';

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_phases_template ON public.profiles USING GIN (phases_template);
