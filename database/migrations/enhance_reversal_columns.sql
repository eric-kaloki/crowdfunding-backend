-- Add enhanced reversal tracking columns to match M-Pesa documentation
ALTER TABLE contributions 
ADD COLUMN IF NOT EXISTS reversal_result_type TEXT,
ADD COLUMN IF NOT EXISTS reversal_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS reversal_original_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS reversal_charge DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS reversal_debit_account_balance TEXT,
ADD COLUMN IF NOT EXISTS reversal_credit_party_name TEXT,
ADD COLUMN IF NOT EXISTS reversal_debit_party_name TEXT,
ADD COLUMN IF NOT EXISTS reversal_completed_time TEXT;

-- Add index for reversal transaction ID lookup
CREATE INDEX IF NOT EXISTS idx_contributions_reversal_transaction 
ON contributions(reversal_transaction_id);

-- Add index for original transaction ID lookup
CREATE INDEX IF NOT EXISTS idx_contributions_reversal_original_transaction 
ON contributions(reversal_original_transaction_id);

-- Update the status constraint to include all possible reversal states
ALTER TABLE contributions 
DROP CONSTRAINT IF EXISTS contributions_status_check;

ALTER TABLE contributions 
ADD CONSTRAINT contributions_status_check 
CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'refund_pending', 'refund_failed'));
