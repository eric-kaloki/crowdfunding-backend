-- Add refund tracking columns to contributions table
ALTER TABLE contributions 
ADD COLUMN IF NOT EXISTS refund_reason TEXT,
ADD COLUMN IF NOT EXISTS refund_initiated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS refund_error TEXT,
ADD COLUMN IF NOT EXISTS reversal_conversation_id TEXT,
ADD COLUMN IF NOT EXISTS reversal_originator_conversation_id TEXT,
ADD COLUMN IF NOT EXISTS reversal_result_code TEXT,
ADD COLUMN IF NOT EXISTS reversal_result_desc TEXT,
ADD COLUMN IF NOT EXISTS reversal_details JSONB;

-- Add indexes for reversal conversation ID lookup
CREATE INDEX IF NOT EXISTS idx_contributions_reversal_conversation 
ON contributions(reversal_conversation_id);

CREATE INDEX IF NOT EXISTS idx_contributions_reversal_originator 
ON contributions(reversal_originator_conversation_id);

-- Update status enum to include refund states
ALTER TABLE contributions 
DROP CONSTRAINT IF EXISTS contributions_status_check;

ALTER TABLE contributions 
ADD CONSTRAINT contributions_status_check 
CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'refund_pending', 'refund_failed'));
