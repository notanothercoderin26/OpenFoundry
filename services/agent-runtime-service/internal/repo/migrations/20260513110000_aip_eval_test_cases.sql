-- AIPLE.19: Manual evaluation test cases.
ALTER TABLE eval_suites
    ADD COLUMN IF NOT EXISTS test_cases JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'eval_suites_test_cases_array'
    ) THEN
        ALTER TABLE eval_suites
            ADD CONSTRAINT eval_suites_test_cases_array CHECK (jsonb_typeof(test_cases) = 'array');
    END IF;
END $$;
