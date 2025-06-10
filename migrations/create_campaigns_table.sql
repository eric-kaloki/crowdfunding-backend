-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    funding_goal DECIMAL(12,2) NOT NULL CHECK (funding_goal > 0),
    current_funding DECIMAL(12,2) DEFAULT 0 CHECK (current_funding >= 0),
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending_approval' CHECK (status IN ('draft', 'pending_approval', 'active', 'funded', 'closed', 'rejected')),
    end_date DATE NOT NULL,
    image_url TEXT,
    featured BOOLEAN DEFAULT FALSE,
    admin_notes TEXT,
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_creator_id ON campaigns(creator_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_category ON campaigns(category);
CREATE INDEX IF NOT EXISTS idx_campaigns_end_date ON campaigns(end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_featured ON campaigns(featured);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_campaigns_updated_at 
    BEFORE UPDATE ON campaigns 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read active campaigns
CREATE POLICY "Users can view active campaigns" ON campaigns
    FOR SELECT USING (status = 'active');

-- Policy: Users can manage their own campaigns
CREATE POLICY "Users can manage own campaigns" ON campaigns
    FOR ALL USING (auth.uid() = creator_id);

-- Policy: Admins can manage all campaigns
CREATE POLICY "Admins can manage all campaigns" ON campaigns
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );
