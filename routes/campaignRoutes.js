const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { broadcastCampaignUpdate } = require('../utils/websocket');

// Import MPesa properly
let mpesa;
try {
  mpesa = require("../config/mpesa");
  console.log('MPesa module loaded successfully');
} catch (error) {
  console.error('Failed to load MPesa module:', error);
  mpesa = null;
}

// Create a new campaign
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, funding_goal, end_date, category } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!title || !description || !funding_goal || !end_date || !category) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    // Validate funding goal
    const goal = parseFloat(funding_goal);
    if (goal < 1000) {
      return res.status(400).json({ error: 'Funding goal must be at least KES 1,000' });
    }

    // Validate end date
    const endDate = new Date(end_date);
    const today = new Date();
    if (endDate <= today) {
      return res.status(400).json({ error: 'End date must be in the future' });
    }

    // Handle image upload if provided
    let imageUrl = null;
    if (req.files && req.files.campaign_image) {
      const file = req.files.campaign_image;
      const timestamp = Date.now();
      const filePath = `campaign_images/${userId}/${timestamp}_${file.name}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('campaign-images')
        .upload(filePath, file.data, {
          contentType: file.mimetype,
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Image upload error:', uploadError);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('campaign-images')
          .getPublicUrl(filePath);
        imageUrl = publicUrl;
      }
    }

    // Create campaign
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .insert({
        title,
        description,
        funding_goal: goal,
        current_funding: 0,
        end_date,
        category,
        creator_id: userId,
        status: 'pending_approval',
        image_url: imageUrl
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Campaign created successfully',
      campaign
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Error creating campaign' });
  }
});

// Get all public campaigns (social feed)
router.get('/public', async (req, res) => {
  try {
    const { page = 1, limit = 10, category, status = 'active' } = req.query;
    const offset = (page - 1) * limit;

    // Get campaigns with profile info
    let campaignsQuery = supabase
      .from('campaigns')
      .select(`
        *,
        profiles!campaigns_creator_id_fkey (
          id,
          name,
          role
        )
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category && category !== 'all') {
      campaignsQuery = campaignsQuery.eq('category', category);
    }

    const { data: campaigns, error: campaignsError } = await campaignsQuery;

    if (campaignsError) {
      console.error('Campaigns query error:', campaignsError);
      throw campaignsError;
    }

    if (!campaigns || campaigns.length === 0) {
      return res.json([]);
    }

    // Get campaign IDs for bulk counting
    const campaignIds = campaigns.map(c => c.id);

    // Get all counts in parallel using proper aggregation
    const [commentsData, contributionsData, organizationsData] = await Promise.all([
      // Get comment counts per campaign
      supabase
        .rpc('get_campaign_comments_count', { campaign_ids: campaignIds })
        .then(result => result.data || []),
      
      // Get contribution counts per campaign  
      supabase
        .rpc('get_campaign_contributions_count', { campaign_ids: campaignIds })
        .then(result => result.data || []),
      
      // Get organization data
      supabase
        .from('organizations')
        .select('user_id, organization_name')
        .in('user_id', campaigns.map(c => c.creator_id))
        .then(result => result.data || [])
    ]);

    // Create lookup maps
    const commentsCounts = {};
    const contributionsCounts = {};
    const orgNames = {};

    // Process counts
    commentsData.forEach(item => {
      commentsCounts[item.campaign_id] = parseInt(item.count) || 0;
    });

    contributionsData.forEach(item => {
      contributionsCounts[item.campaign_id] = parseInt(item.count) || 0;
    });

    organizationsData.forEach(org => {
      orgNames[org.user_id] = org.organization_name;
    });

    // Combine data with accurate counts
    const processedCampaigns = campaigns.map(campaign => ({
      ...campaign,
      profiles: {
        ...campaign.profiles,
        organization_name: orgNames[campaign.creator_id] || null
      },
      comments_count: commentsCounts[campaign.id] || 0,
      contributors_count: contributionsCounts[campaign.id] || 0
    }));

    res.json(processedCampaigns);
  } catch (error) {
    console.error('Error fetching public campaigns:', error);
    res.status(500).json({ error: 'Error fetching campaigns' });
  }
});

// Alternative approach using a single query with left joins
router.get('/public-alt', async (req, res) => {
  try {
    const { page = 1, limit = 10, category, status = 'active' } = req.query;
    const offset = (page - 1) * limit;

    // Get campaigns with profile info
    let campaignsQuery = supabase
      .from('campaigns')
      .select(`
        *,
        profiles!campaigns_creator_id_fkey (
          id,
          name,
          role
        )
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category && category !== 'all') {
      campaignsQuery = campaignsQuery.eq('category', category);
    }

    const { data: campaigns, error: campaignsError } = await campaignsQuery;

    if (campaignsError) {
      console.error('Campaigns query error:', campaignsError);
      throw campaignsError;
    }

    if (!campaigns || campaigns.length === 0) {
      return res.json([]);
    }

    // Get campaign IDs for bulk counting
    const campaignIds = campaigns.map(c => c.id);

    // Get all counts in parallel using proper aggregation
    const [commentsData, contributionsData, organizationsData] = await Promise.all([
      // Get comment counts per campaign
      supabase
        .rpc('get_campaign_comments_count', { campaign_ids: campaignIds })
        .then(result => result.data || []),
      
      // Get contribution counts per campaign  
      supabase
        .rpc('get_campaign_contributions_count', { campaign_ids: campaignIds })
        .then(result => result.data || []),
      
      // Get organization data
      supabase
        .from('organizations')
        .select('user_id, organization_name')
        .in('user_id', campaigns.map(c => c.creator_id))
        .then(result => result.data || [])
    ]);

    // Create lookup maps
    const commentsCounts = {};
    const contributionsCounts = {};
    const orgNames = {};

    // Process counts
    commentsData.forEach(item => {
      commentsCounts[item.campaign_id] = parseInt(item.count) || 0;
    });

    contributionsData.forEach(item => {
      contributionsCounts[item.campaign_id] = parseInt(item.count) || 0;
    });

    organizationsData.forEach(org => {
      orgNames[org.user_id] = org.organization_name;
    });

    // Combine data with accurate counts
    const processedCampaigns = campaigns.map(campaign => ({
      ...campaign,
      profiles: {
        ...campaign.profiles,
        organization_name: orgNames[campaign.creator_id] || null
      },
      comments_count: commentsCounts[campaign.id] || 0,
      contributors_count: contributionsCounts[campaign.id] || 0
    }));

    res.json(processedCampaigns);
  } catch (error) {
    console.error('Error fetching public campaigns (alt):', error);
    res.status(500).json({ error: 'Error fetching campaigns' });
  }
});

// Get user's own campaigns (for profile/dashboard management)
router.get('/my-campaigns', authenticate, async (req, res) => {
  try {
    // First get campaigns with basic profile info
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select(`
        *,
        profiles!campaigns_creator_id_fkey (
          id,
          name,
          role
        )
      `)
      .eq('creator_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // If user is an organization, get organization details
    let organizationName = null;
    if (req.user.role === 'organization') {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('organization_name')
        .eq('user_id', req.user.id)
        .single();
      
      organizationName = orgData?.organization_name || null;
    }

    // Process campaigns to include organization name
    const processedCampaigns = (campaigns || []).map(campaign => ({
      ...campaign,
      profiles: {
        ...campaign.profiles,
        organization_name: organizationName
      }
    }));

    res.json(processedCampaigns);
  } catch (error) {
    console.error('Error fetching user campaigns:', error);
    res.status(500).json({ error: 'Error fetching your campaigns' });
  }
});

// Get all campaigns (public)
router.get('/', async (req, res) => {
  try {
    const { status, category, limit = 20, offset = 0 } = req.query;
    
    let query = supabase
      .from('campaigns')
      .select(`
        *,
        profiles!campaigns_creator_id_fkey (
          id,
          name,
          role
        )
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (category) {
      query = query.eq('category', category);
    }

    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data: campaigns, error } = await query;

    if (error) throw error;

    res.json(campaigns || []);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Error fetching campaigns' });
  }
});

// Get campaign by ID with accurate counts
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get campaign with profile info
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select(`
        *,
        profiles!campaigns_creator_id_fkey (
          id,
          name,
          role
        )
      `)
      .eq('id', id)
      .single();

    if (campaignError) throw campaignError;

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get accurate counts in parallel
    const [commentsResult, contributionsResult, orgResult] = await Promise.all([
      // Count comments
      supabase
        .from('campaign_comments')
        .select('id', { count: 'exact' })
        .eq('campaign_id', id),
      
      // Count contributions
      supabase
        .from('contributions')
        .select('id', { count: 'exact' })
        .eq('campaign_id', id),
      
      // Get organization name if applicable
      campaign.profiles?.role === 'organization' 
        ? supabase
            .from('organizations')
            .select('organization_name')
            .eq('user_id', campaign.creator_id)
            .single()
        : Promise.resolve({ data: null })
    ]);

    // Prepare response with accurate counts
    const campaignWithCounts = {
      ...campaign,
      profiles: {
        ...campaign.profiles,
        organization_name: orgResult.data?.organization_name || null
      },
      comments_count: commentsResult.count || 0,
      contributors_count: contributionsResult.count || 0
    };

    res.json(campaignWithCounts);
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Error fetching campaign details' });
  }
});

// Update campaign (owner only)
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, funding_goal, end_date, category } = req.body;

    // Check if user owns the campaign
    const { data: campaign, error: fetchError } = await supabase
      .from('campaigns')
      .select('creator_id, status')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.creator_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow updates if campaign is in draft or pending status
    if (!['draft', 'pending_approval'].includes(campaign.status) && req.user.role !== 'admin') {
      return res.status(400).json({ error: 'Cannot update active campaigns' });
    }

    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (funding_goal) updateData.funding_goal = parseFloat(funding_goal);
    if (end_date) updateData.end_date = end_date;
    if (category) updateData.category = category;

    const { data: updatedCampaign, error: updateError } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      message: 'Campaign updated successfully',
      campaign: updatedCampaign
    });
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({ error: 'Error updating campaign' });
  }
});

// Admin: Get all campaigns for review
router.get('/admin/all', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log('Admin fetching all campaigns...');

    // Get all campaigns
    const { data: campaigns, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (campaignError) {
      console.error('Error fetching campaigns:', campaignError);
      return res.status(500).json({ error: 'Failed to fetch campaigns' });
    }

    if (!campaigns || campaigns.length === 0) {
      return res.json([]);
    }

    // Get creator details for each campaign
    const campaignsWithCreators = await Promise.all(
      campaigns.map(async (campaign) => {
        try {
          // Get user profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, name, role')
            .eq('id', campaign.creator_id)
            .single();

          let organizationName = null;
          
          // If user is organization, get organization details
          if (profile?.role === 'organization') {
            const { data: orgData } = await supabase
              .from('organizations')
              .select('organization_name')
              .eq('user_id', campaign.creator_id)
              .single();

            if (orgData) {
              organizationName = orgData.organization_name;
            }
          }

          return {
            ...campaign,
            creator: {
              id: profile?.id || campaign.creator_id,
              name: profile?.name || 'Unknown User',
              role: profile?.role || 'user',
              organization_name: organizationName
            }
          };
        } catch (error) {
          return {
            ...campaign,
            creator: {
              id: campaign.creator_id,
              name: 'Unknown User',
              role: 'user',
              organization_name: null
            }
          };
        }
      })
    );

    res.json(campaignsWithCreators);
  } catch (error) {
    console.error('Error fetching admin campaigns:', error);
    res.status(500).json({ error: 'Error fetching campaigns' });
  }
});

// Admin: Approve/reject campaign
router.patch('/:id/approval', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;
    const { status, admin_notes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData = {
      status: status === 'approved' ? 'active' : 'rejected',
      admin_notes: admin_notes || null,
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString()
    };

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        profiles!campaigns_creator_id_fkey (
          id,
          name,
          email
        )
      `)
      .single();

    if (error) throw error;

    // TODO: Send email notification to campaign creator

    res.json({
      message: `Campaign ${status} successfully`,
      campaign
    });
  } catch (error) {
    console.error('Error updating campaign approval:', error);
    res.status(500).json({ error: 'Error updating campaign approval' });
  }
});

// Get campaign by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select(`
        *,
        creator:creator_id (
          id,
          name,
          role,
          organization_profiles (
            organization_name
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Check if user has access to this campaign
    if (req.user.role !== 'admin' && campaign.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Transform the data
    const transformedCampaign = {
      ...campaign,
      creator: {
        id: campaign.creator.id,
        name: campaign.creator.name,
        role: campaign.creator.role,
        organization_name: campaign.creator.organization_profiles?.[0]?.organization_name
      }
    };

    res.json(transformedCampaign);
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Error fetching campaign' });
  }
});

// Update campaign status (admin only)
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;
    const { status } = req.body;

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update({ status })
      .eq('id', id)
      .select(`
        *,
        creator:creator_id (
          id,
          name,
          role,
          organization_profiles (
            organization_name
          )
        )
      `)
      .single();

    if (error) throw error;

    res.json(campaign);
  } catch (error) {
    console.error('Error updating campaign status:', error);
    res.status(500).json({ error: 'Error updating campaign status' });
  }
});

// Create contribution/donation
router.post('/:id/contribute', authenticate, async (req, res) => {
  try {
    const { id: campaignId } = req.params;
    const { amount, anonymous = false, notes, phone_number } = req.body;
    const contributorId = req.user.id;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid contribution amount' });
    }

    // Check if campaign exists and is active
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'active') {
      return res.status(400).json({ error: 'Campaign is not accepting contributions' });
    }

    // Check if campaign has ended
    const endDate = new Date(campaign.end_date);
    if (endDate < new Date()) {
      return res.status(400).json({ error: 'Campaign has ended' });
    }

    // Get contributor's phone number if not provided
    let phoneNumber = phone_number;
    if (!phoneNumber) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', contributorId)
        .single();
      
      phoneNumber = profile?.phone;
    }

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required for payment' });
    }

    // Format phone number for M-Pesa
    const formattedPhone = phoneNumber.startsWith('0') 
      ? `254${phoneNumber.slice(1)}` 
      : phoneNumber.startsWith('+') 
        ? phoneNumber.replace('+', '') 
        : phoneNumber;

    // Create payment reference
    const paymentReference = `CAMP_${campaignId.slice(0, 8)}_${Date.now()}`;

    // Create contribution record FIRST
    const { data: contribution, error: contributionError } = await supabase
      .from('contributions')
      .insert({
        campaign_id: campaignId,
        contributor_id: contributorId,
        amount: parseFloat(amount),
        anonymous,
        notes: notes?.trim() || null,
        mpesa_phone_number: formattedPhone,
        payment_reference: paymentReference,
        status: 'pending',
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        source: 'web'
      })
      .select()
      .single();

    if (contributionError) {
      console.error('Contribution creation error:', contributionError);
      return res.status(500).json({ error: 'Failed to create contribution record' });
    }

    // Check if MPesa is available
    if (!mpesa) {
      console.error('MPesa module not available');
      
      // Update contribution status to failed
      await supabase
        .from('contributions')
        .update({
          status: 'failed',
          result_desc: 'Payment service temporarily unavailable',
          updated_at: new Date().toISOString()
        })
        .eq('id', contribution.id);

      return res.status(503).json({ 
        error: 'Payment service temporarily unavailable. Please try again later.',
        contribution_id: contribution.id,
        retry_after: 300 // Suggest retry after 5 minutes
      });
    }

    // Initiate M-Pesa payment using the dedicated MPesa class
    try {
      console.log('🚀 Initiating MPesa payment for contribution:', contribution.id);
      
      const mpesaResponse = await mpesa.initiateSTKPush(
        formattedPhone, 
        Math.floor(amount), // M-Pesa requires whole numbers
        contribution.id // Use contribution ID as reference
      );

      // Update contribution with M-Pesa details
      await supabase
        .from('contributions')
        .update({
          merchant_request_id: mpesaResponse.MerchantRequestID,
          mpesa_checkout_request_id: mpesaResponse.CheckoutRequestID,
          updated_at: new Date().toISOString()
        })
        .eq('id', contribution.id);

      res.json({
        success: true,
        message: 'Payment initiated successfully',
        contribution: {
          id: contribution.id,
          amount: contribution.amount,
          status: contribution.status,
          payment_reference: contribution.payment_reference
        },
        mpesa: {
          checkout_request_id: mpesaResponse.CheckoutRequestID,
          merchant_request_id: mpesaResponse.MerchantRequestID,
          customer_message: mpesaResponse.CustomerMessage
        },
        instructions: 'Please check your phone for the M-Pesa payment prompt and enter your PIN to complete the transaction.'
      });

    } catch (mpesaError) {
      console.error('❌ M-Pesa initiation error:', mpesaError);
      
      // Update contribution status to failed with detailed error
      await supabase
        .from('contributions')
        .update({
          status: 'failed',
          result_desc: `M-Pesa initiation failed: ${mpesaError.message}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', contribution.id);

      // Determine appropriate HTTP status and user message
      let statusCode = 500;
      let userMessage = 'Failed to initiate payment. Please try again.';
      
      if (mpesaError.message.includes('timeout')) {
        statusCode = 504;
        userMessage = 'Payment service is currently slow. Please try again in a few minutes.';
      } else if (mpesaError.message.includes('Invalid Access Token')) {
        statusCode = 503;
        userMessage = 'Payment service is temporarily unavailable. Please try again later.';
      } else if (mpesaError.message.includes('Invalid phone number')) {
        statusCode = 400;
        userMessage = 'Invalid phone number format. Please check and try again.';
      }

      res.status(statusCode).json({ 
        error: userMessage,
        technical_details: mpesaError.message,
        contribution_id: contribution.id,
        can_retry: statusCode >= 500 // Server errors can be retried
      });
    }

  } catch (error) {
    console.error('❌ Contribution error:', error);
    res.status(500).json({ 
      error: 'Server error processing contribution',
      message: 'Please try again or contact support if the problem persists.'
    });
  }
});

// Get campaign contributions (with privacy controls)
router.get('/:id/contributions', authenticate, async (req, res) => {
  try {
    const { id: campaignId } = req.params;
    const userId = req.user.id;

    // Check if user is campaign creator or admin
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('creator_id')
      .eq('id', campaignId)
      .single();

    const isCreator = campaign?.creator_id === userId;
    const isAdmin = req.user.role === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch contributions with contributor details
    const { data: contributions, error } = await supabase
      .from('contributions')
      .select(`
        *,
        profiles!contributions_contributor_id_fkey (
          id,
          name,
          role
        )
      `)
      .eq('campaign_id', campaignId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch contributions' });
    }

    // Process contributions based on privacy settings
    const processedContributions = contributions.map(contribution => ({
      id: contribution.id,
      amount: contribution.amount,
      created_at: contribution.created_at,
      notes: contribution.notes,
      anonymous: contribution.anonymous,
      contributor: contribution.anonymous ? {
        id: 'anonymous',
        name: 'Anonymous',
        role: 'anonymous'
      } : {
        id: contribution.profiles.id,
        name: contribution.profiles.name,
        role: contribution.profiles.role
      },
      // Only show payment details to admin
      ...(isAdmin && {
        transaction_id: contribution.transaction_id,
        mpesa_phone_number: contribution.mpesa_phone_number,
        payment_reference: contribution.payment_reference
      })
    }));

    res.json(processedContributions);

  } catch (error) {
    console.error('Error fetching contributions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check contribution status
router.get('/contributions/:contributionId/status', authenticate, async (req, res) => {
  try {
    const { contributionId } = req.params;
    const userId = req.user.id;

    const { data: contribution, error } = await supabase
      .from('contributions')
      .select(`
        *,
        campaigns!contributions_campaign_id_fkey (
          id,
          title,
          creator_id
        )
      `)
      .eq('id', contributionId)
      .single();

    if (error || !contribution) {
      return res.status(404).json({ error: 'Contribution not found' });
    }

    // Check if user owns this contribution or is the campaign creator/admin
    const isOwner = contribution.contributor_id === userId;
    const isCreator = contribution.campaigns.creator_id === userId;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isCreator && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      id: contribution.id,
      status: contribution.status,
      amount: contribution.amount,
      created_at: contribution.created_at,
      campaign: {
        id: contribution.campaigns.id,
        title: contribution.campaigns.title
      }
    });

  } catch (error) {
    console.error('Error checking contribution status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get campaign comments
router.get('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id; // May be null for unauthenticated users

    // Get comments with user info and like status
    const { data: comments, error } = await supabase
      .from('campaign_comments')
      .select(`
        id,
        message,
        created_at,
        profiles!campaign_comments_user_id_fkey (
          id,
          name,
          role
        )
      `)
      .eq('campaign_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get likes data for all comments in parallel
    const commentIds = comments.map(c => c.id);
    
    const [likesCountData, userLikesData] = await Promise.all([
      // Get likes count for each comment
      commentIds.length > 0 
        ? supabase
            .from('comment_likes')
            .select('comment_id')
            .in('comment_id', commentIds)
        : Promise.resolve({ data: [] }),
      
      // Get user's likes if authenticated
      userId && commentIds.length > 0
        ? supabase
            .from('comment_likes')
            .select('comment_id')
            .in('comment_id', commentIds)
            .eq('user_id', userId)
        : Promise.resolve({ data: [] })
    ]);

    // Count likes per comment
    const likesCount = {};
    if (likesCountData.data) {
      likesCountData.data.forEach(like => {
        likesCount[like.comment_id] = (likesCount[like.comment_id] || 0) + 1;
      });
    }

    // Track user's likes
    const userLikes = new Set();
    if (userLikesData.data) {
      userLikesData.data.forEach(like => {
        userLikes.add(like.comment_id);
      });
    }

    // Format comments with like data
    const formattedComments = comments.map(comment => ({
      id: comment.id,
      message: comment.message,
      created_at: comment.created_at,
      likes_count: likesCount[comment.id] || 0,
      is_liked: userLikes.has(comment.id),
      user: {
        id: comment.profiles.id,
        name: comment.profiles.name,
        role: comment.profiles.role
      }
    }));

    res.json(formattedComments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Post campaign comment
router.post('/:id/comments', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Comment message is required' });
    }

    // Insert comment
    const { data: comment, error: commentError } = await supabase
      .from('campaign_comments')
      .insert({
        campaign_id: id,
        user_id: req.user.id,
        message: message.trim()
      })
      .select(`
        *,
        profiles!campaign_comments_user_id_fkey (
          id,
          name,
          role
        )
      `)
      .single();

    if (commentError) throw commentError;

    // Get updated comments count
    const { count: newCommentsCount } = await supabase
      .from('campaign_comments')
      .select('id', { count: 'exact' })
      .eq('campaign_id', id);

    // Format comment response
    const formattedComment = {
      id: comment.id,
      message: comment.message,
      created_at: comment.created_at,
      likes_count: 0,
      is_liked: false,
      user: {
        id: comment.profiles.id,
        name: comment.profiles.name,
        role: comment.profiles.role
      }
    };

    // Broadcast real-time update to all users viewing this campaign
    broadcastCampaignUpdate(id, {
      type: 'comment_added',
      data: {
        comment: formattedComment,
        comments_count: newCommentsCount || 0
      }
    });

    res.status(201).json({
      comment: formattedComment,
      comments_count: newCommentsCount || 0
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Like/unlike comment with real-time updates
router.post('/:campaignId/comments/:commentId/like', authenticate, async (req, res) => {
  try {
    const { campaignId, commentId } = req.params;
    const userId = req.user.id;

    // Check if user already liked this comment
    const { data: existingLike } = await supabase
      .from('comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .single();

    let isLiked;
    let likesCount;

    if (existingLike) {
      // Unlike - remove the like
      await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId);
      
      isLiked = false;
    } else {
      // Like - add the like
      await supabase
        .from('comment_likes')
        .insert({
          comment_id: commentId,
          user_id: userId
        });
      
      isLiked = true;
    }

    // Get updated likes count for this comment
    const { count } = await supabase
      .from('comment_likes')
      .select('id', { count: 'exact' })
      .eq('comment_id', commentId);

    likesCount = count || 0;

    // Broadcast real-time update
    broadcastCampaignUpdate(campaignId, {
      type: 'comment_liked',
      data: {
        comment_id: commentId,
        likes_count: likesCount,
        is_liked: isLiked,
        user_id: userId
      }
    });

    res.json({
      is_liked: isLiked,
      likes_count: likesCount
    });
  } catch (error) {
    console.error('Error toggling comment like:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// Get campaign updates
router.get('/:id/updates', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: updates, error } = await supabase
      .from('campaign_updates')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(updates || []);
  } catch (error) {
    console.error('Error fetching updates:', error);
    res.status(500).json({ error: 'Error fetching updates' });
  }
});

// Post campaign update (only by creator)
router.post('/:id/updates', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message } = req.body;
    const userId = req.user.id;

    // Check if user is the campaign creator
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('creator_id')
      .eq('id', id)
      .single();

    if (!campaign || campaign.creator_id !== userId) {
      return res.status(403).json({ error: 'Only campaign creators can post updates' });
    }

    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const { data: update, error } = await supabase
      .from('campaign_updates')
      .insert({
        campaign_id: id,
        title: title.trim(),
        message: message.trim()
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(update);
  } catch (error) {
    console.error('Error posting update:', error);
    res.status(500).json({ error: 'Error posting update' });
  }
});

// Get campaign contributions (for creators and admins only)
router.get('/:id/contributions', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if user is campaign creator or admin
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('creator_id')
      .eq('id', id)
      .single();

    if (!campaign || (campaign.creator_id !== userId && userRole !== 'admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: contributions, error } = await supabase
      .from('contributions')
      .select(`
        *,
        contributor:contributor_id (
          id,
          name
        )
      `)
      .eq('campaign_id', id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(contributions || []);
  } catch (error) {
    console.error('Error fetching contributions:', error);
    res.status(500).json({ error: 'Error fetching contributions' });
  }
});

// Get contributions for a specific campaign
router.get('/:id/contributions', authenticate, async (req, res) => {
  try {
    const { id: campaignId } = req.params;

    // Check if user is campaign creator or admin
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('creator_id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const isOwner = campaign.creator_id === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get contributions for the campaign
    const { data: contributions, error: contributionsError } = await supabase
      .from('contributions')
      .select(`
        *,
        profiles!contributions_contributor_id_fkey (
          id,
          name,
          email
        )
      `)
      .eq('campaign_id', campaignId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (contributionsError) {
      console.error('Error fetching contributions:', contributionsError);
      return res.status(500).json({ error: 'Failed to fetch contributions' });
    }

    res.json(contributions || []);

  } catch (error) {
    console.error('Error fetching campaign contributions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's contribution history
router.get('/my-contributions', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: contributions, error } = await supabase
      .from('contributions')
      .select(`
        *,
        campaigns!contributions_campaign_id_fkey (
          id,
          title,
          description,
          status
        )
      `)
      .eq('contributor_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user contributions:', error);
      return res.status(500).json({ error: 'Failed to fetch contributions' });
    }

    res.json(contributions || []);

  } catch (error) {
    console.error('Error fetching user contributions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
