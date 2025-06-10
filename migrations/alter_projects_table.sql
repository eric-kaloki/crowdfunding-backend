-- Remove existing columns
ALTER TABLE projects 
DROP COLUMN tech_stack,
DROP COLUMN estimated_duration;

-- Add new columns
ALTER TABLE projects 
ADD COLUMN weeks_duration INTEGER CHECK (weeks_duration > 0),
ADD COLUMN application_type TEXT CHECK (application_type IN ('web_app', 'mobile_app', 'both', 'desktop_app')),
ADD COLUMN prd_document_url TEXT,
ADD COLUMN prd_document_path TEXT;
