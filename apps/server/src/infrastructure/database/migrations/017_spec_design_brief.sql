ALTER TABLE specs
  ADD COLUMN IF NOT EXISTS visual_contract jsonb NULL,
  ADD COLUMN IF NOT EXISTS design_brief jsonb NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'specs_visual_contract_object_check'
  ) THEN
    ALTER TABLE specs
      ADD CONSTRAINT specs_visual_contract_object_check
      CHECK (visual_contract IS NULL OR jsonb_typeof(visual_contract) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'specs_design_brief_object_check'
  ) THEN
    ALTER TABLE specs
      ADD CONSTRAINT specs_design_brief_object_check
      CHECK (design_brief IS NULL OR jsonb_typeof(design_brief) = 'object');
  END IF;
END $$;
