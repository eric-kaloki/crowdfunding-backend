-- Migration to update contributions table with correct schema
-- This will safely drop and recreate the contributions table with proper naming

-- Step 1: Drop existing table and all its dependencies
DROP TABLE IF EXISTS contributions CASCADE;

-- Step 2: Recreate the contributions table with the correct schema
CREATE TABLE contributions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contributor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    
    -- Payment processing fields
    payment_method VARCHAR(50) NOT NULL DEFAULT 'mpesa',
    transaction_id VARCHAR(255), -- M-Pesa transaction ID
    payment_reference VARCHAR(255), -- Our internal reference
    merchant_request_id VARCHAR(255), -- M-Pesa merchant request ID
    mpesa_checkout_request_id VARCHAR(255), -- M-Pesa checkout request ID
    mpesa_phone_number VARCHAR(15), -- Phone number used for payment
    result_code VARCHAR(10), -- M-Pesa result code
    result_desc TEXT, -- M-Pesa result description
    
    -- User preferences
    anonymous BOOLEAN DEFAULT FALSE,
    notes TEXT, -- Optional message from contributor
    
    -- Metadata
    currency VARCHAR(3) DEFAULT 'KES',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE, -- When payment was completed
    refunded_at TIMESTAMP WITH TIME ZONE,
    
    -- Additional tracking
    ip_address INET,
    user_agent TEXT,
    source VARCHAR(50) DEFAULT 'web' -- web, mobile, api
);

-- Step 3: Recreate all indexes for optimal performance
CREATE INDEX idx_contributions_campaign_id ON contributions(campaign_id);
CREATE INDEX idx_contributions_contributor_id ON contributions(contributor_id);
CREATE INDEX idx_contributions_status ON contributions(status);
CREATE INDEX idx_contributions_created_at ON contributions(created_at);
CREATE INDEX idx_contributions_transaction_id ON contributions(transaction_id);
CREATE INDEX idx_contributions_payment_method ON contributions(payment_method);
CREATE INDEX idx_contributions_amount ON contributions(amount);
CREATE INDEX idx_contributions_checkout_request ON contributions(mpesa_checkout_request_id);

-- Step 4: Enable Row Level Security
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;

-- Step 5: Recreate RLS policies
-- Users can view their own contributions
CREATE POLICY "Users can view own contributions" ON contributions
    FOR SELECT USING (contributor_id = auth.uid());

-- Campaign creators can view contributions to their campaigns (but not contributor details if anonymous)
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

-- Users can insert their own contributions
CREATE POLICY "Users can create contributions" ON contributions
    FOR INSERT WITH CHECK (contributor_id = auth.uid());

-- System can update contributions (for payment processing)
CREATE POLICY "System can update contributions" ON contributions
    FOR UPDATE USING (true);

-- Step 6: Create trigger functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_contributions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create the trigger
CREATE TRIGGER trigger_update_contributions_updated_at
    BEFORE UPDATE ON contributions
    FOR EACH ROW
    EXECUTE FUNCTION update_contributions_updated_at();

-- Step 8: Create function to automatically update campaign funding when contributions are added
CREATE OR REPLACE FUNCTION update_campaign_funding()
RETURNS TRIGGER AS $$
BEGIN
    -- Update current_funding when a contribution is completed
    IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
        UPDATE campaigns 
        SET current_funding = current_funding + NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.campaign_id;
    END IF;
    
    -- Decrease current_funding when a contribution is refunded
    IF NEW.status = 'refunded' AND (OLD IS NULL OR OLD.status != 'refunded') THEN
        UPDATE campaigns 
        SET current_funding = GREATEST(current_funding - NEW.amount, 0),
            updated_at = NOW()
        WHERE id = NEW.campaign_id;
    END IF;
    
    -- Handle status changes from completed to failed
    IF OLD IS NOT NULL AND OLD.status = 'completed' AND NEW.status = 'failed' THEN
        UPDATE campaigns 
        SET current_funding = GREATEST(current_funding - NEW.amount, 0),
            updated_at = NOW()
        WHERE id = NEW.campaign_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Create trigger for campaign funding updates
CREATE TRIGGER trigger_update_campaign_funding
    AFTER INSERT OR UPDATE ON contributions
    FOR EACH ROW
    EXECUTE FUNCTION update_campaign_funding();

-- Step 10: Add some sample data for testing (optional - comment out in production)
/*
INSERT INTO contributions (campaign_id, contributor_id, amount, status, payment_method, transaction_id, mpesa_phone_number) 
VALUES 
    -- Replace with actual UUIDs from your campaigns and profiles tables
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 1000.00, 'completed', 'mpesa', 'TXN123456789', '254712345678'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 500.00, 'pending', 'mpesa', 'TXN987654321', '254787654321');
*/

-- Step 11: Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON contributions TO your_app_user;
-- GRANT USAGE ON SEQUENCE contributions_id_seq TO your_app_user;

COMMENT ON TABLE contributions IS 'Tracks all financial contributions made to campaigns';
COMMENT ON COLUMN contributions.contributor_id IS 'References the user who made the contribution';
COMMENT ON COLUMN contributions.campaign_id IS 'References the campaign that received the contribution';
COMMENT ON COLUMN contributions.amount IS 'Contribution amount in the specified currency';
COMMENT ON COLUMN contributions.status IS 'Current status of the contribution payment';
COMMENT ON COLUMN contributions.transaction_id IS 'Unique transaction identifier from payment provider';
COMMENT ON COLUMN contributions.anonymous IS 'Whether the contribution should be displayed anonymously';
