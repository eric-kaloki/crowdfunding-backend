-- Add approval status and certificate fields to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS registration_certificate_url TEXT,
ADD COLUMN IF NOT EXISTS registration_certificate_path TEXT,
ADD COLUMN IF NOT EXISTS approval_notes TEXT,
ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Update existing organizations to have pending status
UPDATE organizations SET approval_status = 'pending' WHERE approval_status IS NULL;
