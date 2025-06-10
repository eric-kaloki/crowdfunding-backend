-- Create platform_settings table for storing application configuration
CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    setting_key VARCHAR(255) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_platform_settings_category ON platform_settings(category);
CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON platform_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_platform_settings_updated_at ON platform_settings(updated_at);

-- Enable Row Level Security
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write platform settings
CREATE POLICY "Admins can manage platform settings" ON platform_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_platform_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_platform_settings_updated_at
    BEFORE UPDATE ON platform_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_platform_settings_updated_at();

-- Insert default platform settings
INSERT INTO platform_settings (setting_key, setting_value, category, description) VALUES
-- General settings
('platform_name', '"Transcends Corp"', 'general', 'Name of the crowdfunding platform'),
('platform_description', '"Kenya''s leading crowdfunding platform connecting dreamers with supporters"', 'general', 'Platform description'),
('support_email', '"transcends.corp@gmail.com"', 'general', 'Support contact email'),
('platform_url', '"https://transcends.com"', 'general', 'Main platform URL'),
('maintenance_mode', 'false', 'general', 'Enable/disable maintenance mode'),
('registration_enabled', 'true', 'general', 'Allow new user registrations'),

-- Campaign settings
('approval_required', 'true', 'campaigns', 'Require admin approval for new campaigns'),
('max_campaign_duration', '90', 'campaigns', 'Maximum campaign duration in days'),
('min_funding_goal', '10000', 'campaigns', 'Minimum funding goal in KES'),
('max_funding_goal', '10000000', 'campaigns', 'Maximum funding goal in KES'),
('featured_campaigns_limit', '10', 'campaigns', 'Number of featured campaigns on homepage'),
('allowed_categories', '["Education", "Healthcare", "Technology", "Environment", "Agriculture", "Community Development", "Arts & Culture", "Emergency Relief", "Sports & Recreation", "Other"]', 'campaigns', 'Allowed campaign categories'),

-- Payment settings
('platform_fee_percentage', '5.0', 'payments', 'Platform fee percentage'),
('minimum_contribution', '100', 'payments', 'Minimum contribution amount in KES'),
('maximum_contribution', '1000000', 'payments', 'Maximum contribution amount in KES'),
('payment_methods', '["M-Pesa", "Bank Transfer", "Card"]', 'payments', 'Available payment methods'),
('refund_policy', '"Refunds are processed within 7-14 business days. Campaign creators must approve refund requests for contributions made to their campaigns."', 'payments', 'Platform refund policy'),

-- User settings
('email_verification_required', 'true', 'users', 'Require email verification for new accounts'),
('organization_approval_required', 'true', 'users', 'Require admin approval for organization accounts'),
('max_campaigns_per_user', '5', 'users', 'Maximum campaigns per user'),
('account_deletion_enabled', 'true', 'users', 'Allow users to delete their own accounts'),

-- Notification settings
('email_notifications_enabled', 'true', 'notifications', 'Enable email notifications'),
('sms_notifications_enabled', 'false', 'notifications', 'Enable SMS notifications'),
('campaign_updates_enabled', 'true', 'notifications', 'Enable campaign update notifications'),
('system_alerts_enabled', 'true', 'notifications', 'Enable system alert notifications'),

-- Security settings
('password_min_length', '8', 'security', 'Minimum password length'),
('session_timeout_minutes', '60', 'security', 'Session timeout in minutes'),
('max_login_attempts', '5', 'security', 'Maximum failed login attempts before lockout'),
('two_factor_required', 'false', 'security', 'Require two-factor authentication for admin accounts');

COMMENT ON TABLE platform_settings IS 'Stores configurable platform settings and preferences';
COMMENT ON COLUMN platform_settings.setting_key IS 'Unique identifier for the setting';
COMMENT ON COLUMN platform_settings.setting_value IS 'JSON value of the setting (supports strings, numbers, booleans, arrays, objects)';
COMMENT ON COLUMN platform_settings.category IS 'Category grouping for related settings';
COMMENT ON COLUMN platform_settings.updated_by IS 'Admin user who last updated this setting';
