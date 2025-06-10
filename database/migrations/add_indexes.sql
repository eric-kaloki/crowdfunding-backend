-- OPTIMIZATION 22: Add indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status);
CREATE INDEX IF NOT EXISTS idx_contributions_payment_method ON contributions(payment_method);
CREATE INDEX IF NOT EXISTS idx_contributions_created_at ON contributions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contributions_checkout_request ON contributions(mpesa_checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_contributions_transaction_id ON contributions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_contributions_campaign_id ON contributions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contributions_contributor_id ON contributions(contributor_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_contributions_status_created ON contributions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contributions_campaign_status ON contributions(campaign_id, status);

-- Campaign indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_creator_id ON campaigns(creator_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

-- Profile indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Organization indexes  
CREATE INDEX IF NOT EXISTS idx_organizations_user_id ON organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_organizations_approval_status ON organizations(approval_status);
