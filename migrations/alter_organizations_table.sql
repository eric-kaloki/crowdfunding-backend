-- Add approval status and related fields to organizations table
ALTER TABLE organizations 
ADD COLUMN approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
ADD COLUMN approval_notes TEXT,
ADD COLUMN rejection_reason TEXT,
ADD COLUMN approved_by UUID REFERENCES profiles(id),
ADD COLUMN approved_at TIMESTAMP,
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create index for better query performance
CREATE INDEX idx_organizations_approval_status ON organizations(approval_status);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organizations_updated_at_trigger
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_organizations_updated_at();

-- Update existing records to have pending status if NULL
UPDATE organizations 
SET approval_status = 'pending' 
WHERE approval_status IS NULL;
