-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles Table (Enhanced for crowdfunding) - Renamed from users to avoid Supabase conflict
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  phone TEXT,
  profile_image TEXT,
  role TEXT CHECK (role IN ('user', 'organization', 'admin')) DEFAULT 'user',
  verification_status TEXT CHECK (verification_status IN ('pending', 'verified', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  google_id VARCHAR(255) UNIQUE,
  profile_picture TEXT
);

-- Organizations Table (New)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL,
  organization_description TEXT,
  organization_registration_number TEXT,
  contact_person TEXT,
  registration_certificate_url TEXT,
  approval_status TEXT CHECK (approval_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  approval_notes TEXT,
  rejection_reason TEXT,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending', -- Legacy field
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campaigns Table (Replaces projects for crowdfunding)
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  funding_goal NUMERIC(12,2) NOT NULL,
  current_funding NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'KES',
  campaign_type TEXT CHECK (campaign_type IN ('all_or_nothing', 'flexible')) DEFAULT 'all_or_nothing',
  status TEXT CHECK (status IN ('draft', 'pending_approval', 'active', 'funded', 'closed', 'cancelled')) DEFAULT 'draft',
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  image_url TEXT,
  video_url TEXT,
  rewards TEXT[], -- JSON array of reward tiers
  story TEXT, -- Detailed campaign story
  risks_and_challenges TEXT,
  featured BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contributions Table (Replaces payments for crowdfunding)
CREATE TABLE contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id),
  backer_id UUID REFERENCES profiles(id),
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'KES',
  mpesa_phone_number TEXT NOT NULL,
  mpesa_transaction_id TEXT UNIQUE,
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  payment_provider TEXT DEFAULT 'mpesa',
  mpesa_checkout_request_id TEXT,
  result_code TEXT,
  result_desc TEXT,
  merchant_request_id TEXT,
  reward_tier TEXT, -- Selected reward tier
  anonymous BOOLEAN DEFAULT FALSE,
  refund_reason TEXT,
  refunded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_google_id ON profiles(google_id);
CREATE INDEX idx_organizations_user_id ON organizations(user_id);
CREATE INDEX idx_organizations_status ON organizations(status);
CREATE INDEX idx_organizations_approval_status ON organizations(approval_status);
CREATE INDEX idx_organizations_certificate_url ON organizations(registration_certificate_url);
CREATE INDEX idx_campaigns_creator_id ON campaigns(creator_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_category ON campaigns(category);
CREATE INDEX idx_campaigns_end_date ON campaigns(end_date);
CREATE INDEX idx_contributions_campaign_id ON contributions(campaign_id);
CREATE INDEX idx_contributions_backer_id ON contributions(backer_id);
CREATE INDEX idx_contributions_status ON contributions(status);