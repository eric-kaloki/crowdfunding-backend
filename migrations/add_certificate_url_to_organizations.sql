-- Add registration certificate URL column to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS registration_certificate_url TEXT;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_organizations_certificate_url ON organizations(registration_certificate_url);
