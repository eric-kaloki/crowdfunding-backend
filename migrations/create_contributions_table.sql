-- Create contributions table for tracking donations
CREATE TABLE IF NOT EXISTS contributions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contributor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'mpesa',
    transaction_id VARCHAR(255),
    payment_reference VARCHAR(255),
    currency VARCHAR(3) DEFAULT 'KES',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    refunded_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contributions_campaign_id ON contributions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contributions_contributor_id ON contributions(contributor_id);
CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status);
CREATE INDEX IF NOT EXISTS idx_contributions_created_at ON contributions(created_at);
CREATE INDEX IF NOT EXISTS idx_contributions_transaction_id ON contributions(transaction_id);

-- Add RLS (Row Level Security) policies
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;

-- Users can view their own contributions
CREATE POLICY "Users can view own contributions" ON contributions
    FOR SELECT USING (contributor_id = auth.uid());

-- Campaign creators can view contributions to their campaigns
CREATE POLICY "Campaign creators can view contributions" ON contributions
    FOR SELECT USING (
        campaign_id IN (
            SELECT id FROM campaigns WHERE creator_id = auth.uid()
        )
    );

-- Admins can view all contributions
CREATE POLICY "Admins can view all contributions" ON contributions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only admins can update contribution status (for refunds, etc.)
CREATE POLICY "Admins can update contributions" ON contributions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contributions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_contributions_updated_at
    BEFORE UPDATE ON contributions
    FOR EACH ROW
    EXECUTE FUNCTION update_contributions_updated_at();

-- Add sample data for testing (optional)
-- INSERT INTO contributions (campaign_id, contributor_id, amount, status, payment_method, transaction_id) VALUES
-- ('campaign-uuid-here', 'user-uuid-here', 1000.00, 'completed', 'mpesa', 'TXN123456789');
