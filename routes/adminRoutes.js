const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticate, isAdmin, requireAdmin } = require('../middleware/auth');
const { sendOrganizationStatusEmail } = require('../utils/otpUtils');

// Apply authentication and admin requirement to all routes
router.use(authenticate);
router.use(requireAdmin);

// Get admin dashboard stats
router.get('/', authenticate, isAdmin, async (req, res) => {
  res.json({ message: 'Hello from admin dashboard' });
});

router.get('/stats', authenticate, isAdmin, async (req, res) => {
  try {
    // Get campaign stats
    const { data: campaigns, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, status, current_funding');

    // Get user stats
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, role');

    // Get organization stats
    const { data: organizations, error: orgError } = await supabase
      .from('organizations')
      .select('id, approval_status');

    if (campaignError || userError || orgError) {
      console.error('Error fetching stats:', { campaignError, userError, orgError });
      return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }

    // Calculate stats
    const stats = {
      totalCampaigns: campaigns?.length || 0,
      activeCampaigns: campaigns?.filter(c => c.status === 'active').length || 0,
      pendingCampaigns: campaigns?.filter(c => c.status === 'pending_approval').length || 0,
      fundedCampaigns: campaigns?.filter(c => c.status === 'funded').length || 0,
      totalFundsRaised: campaigns?.reduce((sum, c) => sum + (c.current_funding || 0), 0) || 0,
      totalUsers: users?.filter(u => u.role !== 'admin').length || 0,
      totalOrganizations: organizations?.length || 0,
      pendingOrganizations: organizations?.filter(o => o.approval_status === 'pending').length || 0,
      recentActivity: []
    };

    res.json(stats);
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all campaigns with creator information for admin oversight
router.get('/campaigns', async (req, res) => {
  try {
    console.log('Fetching campaigns for admin...');

    // First, get all campaigns
    const { data: campaigns, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (campaignError) {
      console.error('Error fetching campaigns:', campaignError);
      return res.status(500).json({ error: 'Failed to fetch campaigns' });
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('No campaigns found');
      return res.json([]);
    }

    console.log(`Found ${campaigns.length} campaigns`);

    // Get creator details for each campaign
    const campaignsWithCreators = await Promise.all(
      campaigns.map(async (campaign) => {
        try {
          // Get user profile
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, name, role')
            .eq('id', campaign.creator_id)
            .single();

          if (profileError) {
            console.error(`Error fetching profile for ${campaign.creator_id}:`, profileError);
          }

          let organizationName = null;
          
          // If user is organization, get organization details
          if (profile?.role === 'organization') {
            const { data: orgData, error: orgError } = await supabase
              .from('organizations')
              .select('organization_name')
              .eq('user_id', campaign.creator_id)
              .single();

            if (!orgError && orgData) {
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
          console.error(`Error processing campaign ${campaign.id}:`, error);
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

    console.log('Successfully processed campaigns with creators');
    res.json(campaignsWithCreators);

  } catch (error) {
    console.error('Admin campaigns fetch error:', error);
    res.status(500).json({ error: 'Server error fetching campaigns' });
  }
});

// Get all campaigns with details (alias for legacy projects endpoint)
router.get('/projects', authenticate, isAdmin, async (req, res) => {
  try {
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('*, creator:creator_id(id, name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error fetching campaigns' });
  }
});

// Get single campaign with details
router.get('/projects/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*, creator:creator_id(id, name)')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error fetching campaign details' });
  }
});

// Update campaign status
router.patch('/projects/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status for campaigns
    const validStatuses = ['draft', 'pending_approval', 'active', 'funded', 'closed', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData = {
      ...(status && { status }),
      updated_at: new Date().toISOString()
    };

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', id)
      .select('*, creator:creator_id(id, email)')
      .single();

    if (error) throw error;

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error updating campaign' });
  }
});

// Update campaign status (approve/reject)
router.patch('/campaigns/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    // Validate required fields
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Validate status values
    const validStatuses = ['pending_approval', 'active', 'rejected', 'paused', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    // Check if campaign exists
    const { data: existingCampaign, error: fetchError } = await supabase
      .from('campaigns')
      .select('id, status, title')
      .eq('id', id)
      .single();

    if (fetchError || !existingCampaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Prepare update data
    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };

    // Only add admin_notes if it's provided
    if (admin_notes !== undefined && admin_notes !== null) {
      updateData.admin_notes = admin_notes;
    }

    // Update campaign status
    const { data: updatedCampaign, error: updateError } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating campaign status:', updateError);
      return res.status(500).json({ error: 'Failed to update campaign status' });
    }

    // Log the status change for audit purposes
    console.log(`Campaign ${id} status updated from ${existingCampaign.status} to ${status} by admin`);

    res.json({
      message: `Campaign status updated to ${status}`,
      campaign: updatedCampaign
    });

  } catch (error) {
    console.error('Error updating campaign status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Optional: Keep this endpoint for other uses or remove if not needed
// Get campaign details by ID for admin review with full media information
router.get('/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get campaign with creator details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get creator profile information
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', campaign.creator_id)
      .single();

    let organizationName = null;

    // Get organization details if creator is organization
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

    // Transform the response
    const campaignDetails = {
      ...campaign,
      creator: {
        id: profile?.id || campaign.creator_id,
        name: profile?.name || 'Unknown User',
        role: profile?.role || 'user',
        organization_name: organizationName
      }
    };

    res.json(campaignDetails);
  } catch (error) {
    console.error('Error fetching campaign details:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all users
router.get('/users', authenticate, isAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error fetching users' });
  }
});

// Get all organizations for admin review
router.get('/organizations', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: organizations, error } = await supabase
      .from('organizations')
      .select(`
        *,
        profiles!organizations_user_id_fkey (
          id,
          name,
          email,
          phone,
          created_at
        ),
        approver:approved_by (
          id,
          name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(organizations || []);
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Error fetching organizations' });
  }
});

// Get pending organizations
router.get('/organizations/pending', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: organizations, error } = await supabase
      .from('organizations')
      .select(`
        *,
        profiles!organizations_user_id_fkey (
          id,
          name,
          email,
          phone,
          created_at
        )
      `)
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(organizations || []);
  } catch (error) {
    console.error('Error fetching pending organizations:', error);
    res.status(500).json({ error: 'Error fetching pending organizations' });
  }
});

// Get organization by ID
router.get('/organizations/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;

    const { data: organization, error } = await supabase
      .from('organizations')
      .select(`
        *,
        profiles!organizations_user_id_fkey (
          id,
          name,
          email,
          phone,
          created_at,
          verification_status
        ),
        approver:approved_by (
          id,
          name,
          email
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(organization);
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ error: 'Error fetching organization details' });
  }
});

// Update organization approval status
router.patch('/organizations/:id/approval', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;
    const { approval_status, approval_notes } = req.body;
    const adminId = req.user.id;

    // Validate required fields
    if (!approval_status || !['pending', 'approved', 'rejected'].includes(approval_status)) {
      return res.status(400).json({ error: 'Invalid approval status' });
    }

    if (approval_status === 'rejected' && !approval_notes?.trim()) {
      return res.status(400).json({ error: 'Approval notes are required when rejecting' });
    }

    // Get organization details for email notification
    const { data: organizationDetails, error: fetchError } = await supabase
      .from('organizations')
      .select(`
        *,
        profiles:user_id (
          name,
          email
        )
      `)
      .eq('id', id)
      .single();

    if (fetchError || !organizationDetails) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Prepare update data
    const updateData = {
      approval_status,
      approved_by: adminId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add approval notes if provided
    if (approval_notes?.trim()) {
      updateData.approval_notes = approval_notes.trim();
    }

    // Update organization
    const { data: updatedOrg, error: updateError } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        profiles:user_id (
          id,
          name,
          email,
          phone
        )
      `)
      .single();

    if (updateError) {
      console.error('Error updating organization:', updateError);
      return res.status(500).json({ error: 'Failed to update organization status' });
    }

    // Send email notification asynchronously
    try {
      await sendOrganizationStatusEmail(
        organizationDetails.profiles.email,
        organizationDetails.organization_name,
        approval_status,
        approval_notes || ''
      );
      console.log('Email notification sent to:', organizationDetails.profiles.email);
    } catch (emailError) {
      console.error('Failed to send email notification:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      message: `Organization ${approval_status} successfully`,
      organization: updatedOrg
    });

  } catch (error) {
    console.error('Organization approval error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all contributions for admin management
router.get('/contributions', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, payment_method } = req.query;
    const offset = (page - 1) * limit;

    // Build query with proper joins to get related data
    let query = supabase
      .from('contributions')
      .select(`
        id,
        amount,
        status,
        payment_method,
        transaction_id,
        created_at,
        campaign_id,
        contributor_id,
        campaigns!inner (
          id,
          title
        ),
        profiles!contributions_contributor_id_fkey (
          id,
          name,
          email
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    // Apply filters if provided
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (payment_method && payment_method !== 'all') {
      query = query.eq('payment_method', payment_method);
    }

    const { data: contributions, error } = await query;

    if (error) {
      console.error('Error fetching contributions:', error);
      return res.status(500).json({ error: 'Failed to fetch contributions' });
    }

    // Transform the data to match frontend expectations
    const transformedContributions = (contributions || []).map(contribution => ({
      id: contribution.id,
      amount: Number(contribution.amount) || 0,
      status: contribution.status,
      payment_method: contribution.payment_method,
      transaction_id: contribution.transaction_id,
      created_at: contribution.created_at,
      campaign: {
        id: contribution.campaigns?.id || contribution.campaign_id,
        title: contribution.campaigns?.title || 'Unknown Campaign'
      },
      contributor: {
        id: contribution.profiles?.id || contribution.contributor_id,
        name: contribution.profiles?.name || 'Unknown Contributor',
        email: contribution.profiles?.email || 'unknown@email.com'
      }
    }));

    // Calculate summary statistics from all contributions
    const { data: allContributions } = await supabase
      .from('contributions')
      .select('status, amount, created_at');

    const completedContributions = allContributions?.filter(c => c.status === 'completed') || [];
    const totalAmount = completedContributions.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const totalCount = allContributions?.length || 0;

    // Calculate monthly growth (simplified - you can enhance this)
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const thisMonthContributions = completedContributions.filter(c => 
      new Date(c.created_at) >= thisMonth
    );
    const lastMonthContributions = completedContributions.filter(c => 
      new Date(c.created_at) >= lastMonth && new Date(c.created_at) < thisMonth
    );

    const thisMonthAmount = thisMonthContributions.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const lastMonthAmount = lastMonthContributions.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    
    const monthlyGrowth = lastMonthAmount > 0 
      ? ((thisMonthAmount - lastMonthAmount) / lastMonthAmount) * 100 
      : 0;

    const stats = {
      totalAmount,
      totalCount,
      successfulContributions: completedContributions.length,
      failedContributions: allContributions?.filter(c => c.status === 'failed').length || 0,
      averageContribution: completedContributions.length > 0 
        ? totalAmount / completedContributions.length 
        : 0,
      monthlyGrowth
    };

    res.json({
      contributions: transformedContributions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      },
      stats
    });

  } catch (error) {
    console.error('Error in admin contributions endpoint:', error);
    res.status(500).json({ error: 'Server error fetching contributions' });
  }
});

// Enhanced refund endpoint with better status tracking
router.post('/contributions/:id/refund', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Admin initiated refund' } = req.body;

    // Check if contribution exists and is completed
    const { data: contribution, error: findError } = await supabase
      .from('contributions')
      .select('id, status, amount, transaction_id, payment_method, campaign_id, created_at')
      .eq('id', id)
      .single();

    if (findError || !contribution) {
      return res.status(404).json({ error: 'Contribution not found' });
    }

    if (contribution.status !== 'completed') {
      return res.status(400).json({ error: 'Only completed contributions can be refunded' });
    }

    if (['refunded', 'refund_pending', 'refund_failed'].includes(contribution.status)) {
      return res.status(400).json({ error: `Contribution is already ${contribution.status}` });
    }

    // For M-Pesa payments, initiate reversal
    if (contribution.payment_method === 'mpesa' && contribution.transaction_id) {
      const mpesa = require('../config/mpesa');
      
      try {
        console.log(`💰 Processing M-Pesa refund for contribution ${id}`);

        // Check if transaction is too old (M-Pesa has time limits)
        const contributionAge = Date.now() - new Date(contribution.created_at).getTime();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        const ageWarning = contributionAge > maxAge;

        // Initiate M-Pesa reversal
        const reversalResult = await mpesa.initiateReversal(
          contribution.transaction_id,
          contribution.amount,
          reason
        );

        if (reversalResult.success) {
          // Update contribution with reversal tracking info
          await supabase
            .from('contributions')
            .update({
              status: 'refund_pending',
              reversal_conversation_id: reversalResult.ConversationID,
              reversal_originator_conversation_id: reversalResult.OriginatorConversationID,
              refund_reason: reason,
              refund_initiated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              // Add estimated completion time
              refund_estimated_completion: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes estimate
            })
            .eq('id', id);

          console.log(`✅ Reversal initiated for contribution ${id} with conversation ${reversalResult.ConversationID}`);

          res.json({ 
            success: true,
            message: 'M-Pesa reversal initiated successfully. Processing will complete automatically via callback.',
            conversationId: reversalResult.ConversationID,
            status: 'refund_pending',
            estimatedCompletion: '5-15 minutes',
            trackingInfo: {
              conversationId: reversalResult.ConversationID,
              callbackExpected: true,
              callbackUrl: reversalResult.callbackUrl
            },
            ...(ageWarning && {
              warning: 'Transaction is older than 24 hours - reversal success rate may be lower'
            })
          });
        } else {
          throw new Error('Failed to initiate M-Pesa reversal');
        }

      } catch (mpesaError) {
        console.error('M-Pesa reversal initiation failed:', mpesaError);
        
        // Mark as failed with detailed error info
        await supabase
          .from('contributions')
          .update({
            status: 'refund_failed',
            refund_reason: reason,
            refund_error: mpesaError.message,
            refund_initiated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        return res.status(500).json({ 
          success: false,
          error: 'M-Pesa reversal initiation failed',
          details: mpesaError.message,
          action_required: 'manual_processing',
          supportInfo: {
            contributionId: id,
            transactionId: contribution.transaction_id,
            amount: contribution.amount
          }
        });
      }
    } else {
      // For non-M-Pesa payments, mark as refunded immediately
      await supabase
        .from('contributions')
        .update({
          status: 'refunded',
          refund_reason: reason,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      // Update campaign funding
      if (contribution.campaign_id) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('current_funding')
          .eq('id', contribution.campaign_id)
          .single();

        if (campaign) {
          await supabase
            .from('campaigns')
            .update({
              current_funding: Math.max(0, (campaign.current_funding || 0) - contribution.amount),
              updated_at: new Date().toISOString()
            })
            .eq('id', contribution.campaign_id);
        }
      }

      res.json({ 
        success: true,
        message: 'Contribution refunded successfully',
        status: 'refunded'
      });
    }

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error processing refund',
      details: error.message
    });
  }
});

// New endpoint to check refund status
router.get('/contributions/:id/refund-status', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: contribution, error } = await supabase
      .from('contributions')
      .select(`
        id, 
        status, 
        refund_reason,
        refund_initiated_at,
        refunded_at,
        reversal_result_code,
        reversal_result_desc,
        reversal_conversation_id,
        reversal_callback_received_at,
        refund_estimated_completion,
        refund_error
      `)
      .eq('id', id)
      .single();

    if (error || !contribution) {
      return res.status(404).json({ error: 'Contribution not found' });
    }

    // Calculate status details
    const statusDetails = {
      id: contribution.id,
      status: contribution.status,
      refundReason: contribution.refund_reason,
      initiatedAt: contribution.refund_initiated_at,
      completedAt: contribution.refunded_at,
      estimatedCompletion: contribution.refund_estimated_completion,
      error: contribution.refund_error,
      isComplete: ['refunded', 'refund_failed'].includes(contribution.status),
      isPending: contribution.status === 'refund_pending'
    };

    // Add M-Pesa specific details if available
    if (contribution.reversal_conversation_id) {
      const mpesa = require('../config/mpesa');
      const reversalStatus = await mpesa.checkReversalStatus(contribution.reversal_conversation_id);
      
      statusDetails.mpesaDetails = {
        conversationId: contribution.reversal_conversation_id,
        resultCode: contribution.reversal_result_code,
        resultDesc: contribution.reversal_result_desc,
        callbackReceived: !!contribution.reversal_callback_received_at,
        reversalStatus: reversalStatus
      };

      // Add time estimates for pending reversals
      if (contribution.status === 'refund_pending') {
        const timeSinceInitiation = Date.now() - new Date(contribution.refund_initiated_at).getTime();
        const minutesSinceInitiation = Math.floor(timeSinceInitiation / (1000 * 60));
        
        statusDetails.timing = {
          minutesSinceInitiation,
          expectedCompletionRange: '5-15 minutes',
          shouldCompleteBy: contribution.refund_estimated_completion,
          isOverdue: minutesSinceInitiation > 15
        };
      }
    }

    res.json(statusDetails);
  } catch (error) {
    console.error('Error fetching refund status:', error);
    res.status(500).json({ error: 'Server error fetching refund status' });
  }
});

// New endpoint for admin to manually check callback status
router.post('/contributions/:id/check-reversal-status', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: contribution, error } = await supabase
      .from('contributions')
      .select('reversal_conversation_id')
      .eq('id', id)
      .single();

    if (error || !contribution || !contribution.reversal_conversation_id) {
      return res.status(404).json({ error: 'Contribution or reversal not found' });
    }

    const mpesa = require('../config/mpesa');
    const status = await mpesa.checkReversalStatus(contribution.reversal_conversation_id);

    res.json(status);
  } catch (error) {
    console.error('Error checking reversal status:', error);
    res.status(500).json({ error: 'Server error checking reversal status' });
  }
});

// Export contributions data
router.get('/contributions/export', async (req, res) => {
  try {
    // Get all contributions with related data
    const { data: contributions, error } = await supabase
      .from('contributions')
      .select(`
        id,
        amount,
        status,
        payment_method,
        transaction_id,
        created_at,
        campaigns!inner (
          title
        ),
        profiles!contributions_contributor_id_fkey (
          name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Convert to CSV format
    const csvHeaders = [
      'ID',
      'Amount',
      'Status',
      'Payment Method',
      'Transaction ID',
      'Campaign',
      'Contributor Name',
      'Contributor Email',
      'Date'
    ];

    const csvData = contributions.map(c => [
      c.id,
      c.amount,
      c.status,
      c.payment_method,
      c.transaction_id || 'N/A',
      c.campaigns?.title || 'Unknown Campaign',
      c.profiles?.name || 'Unknown Contributor',
      c.profiles?.email || 'unknown@email.com',
      new Date(c.created_at).toISOString().split('T')[0]
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvData.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contributions.csv');
    res.send(csvContent);

  } catch (error) {
    console.error('Error exporting contributions:', error);
    res.status(500).json({ error: 'Server error exporting contributions' });
  }
});

// Get analytics data
router.get('/analytics', async (req, res) => {
  try {
    const { days = '30' } = req.query;
    const daysNumber = parseInt(days);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNumber);

    // Get overview data - FIX: Include title field in campaigns query
    const { data: campaigns, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, title, status, current_funding, funding_goal, category, created_at');

    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, role, created_at')
      .gte('created_at', startDate.toISOString());

    const { data: contributions, error: contributionError } = await supabase
      .from('contributions')
      .select('id, amount, created_at, payment_method, status, campaign_id')
      .gte('created_at', startDate.toISOString());

    if (campaignError || userError || contributionError) {
      console.error('Analytics fetch error:', { campaignError, userError, contributionError });
      return res.status(500).json({ error: 'Failed to fetch analytics data' });
    }

    // Calculate overview metrics
    const totalUsers = users?.length || 0;
    const totalCampaigns = campaigns?.length || 0;
    const totalRaised = campaigns?.reduce((sum, c) => sum + (c.current_funding || 0), 0) || 0;
    const totalContributions = contributions?.length || 0;

    // Calculate growth metrics (simplified)
    const halfPeriod = Math.floor(daysNumber / 2);
    const midDate = new Date();
    midDate.setDate(midDate.getDate() - halfPeriod);

    const recentUsers = users?.filter(u => new Date(u.created_at) >= midDate).length || 0;
    const earlierUsers = totalUsers - recentUsers;
    const userGrowth = earlierUsers > 0 ? ((recentUsers - earlierUsers) / earlierUsers) * 100 : 0;

    const recentCampaigns = campaigns?.filter(c => new Date(c.created_at) >= midDate).length || 0;
    const earlierCampaigns = totalCampaigns - recentCampaigns;
    const campaignGrowth = earlierCampaigns > 0 ? ((recentCampaigns - earlierCampaigns) / earlierCampaigns) * 100 : 0;

    const recentContributions = contributions?.filter(c => new Date(c.created_at) >= midDate).length || 0;
    const earlierContributions = totalContributions - recentContributions;
    const contributionGrowth = earlierContributions > 0 ? ((recentContributions - earlierContributions) / earlierContributions) * 100 : 0;

    const recentRevenue = contributions?.filter(c => new Date(c.created_at) >= midDate).reduce((sum, c) => sum + (c.amount || 0), 0) || 0;
    const earlierRevenue = totalRaised - recentRevenue;
    const revenueGrowth = earlierRevenue > 0 ? ((recentRevenue - earlierRevenue) / earlierRevenue) * 100 : 0;

    // Campaigns by category
    const categoryStats = {};
    campaigns?.forEach(campaign => {
      const category = campaign.category || 'Other';
      if (!categoryStats[category]) {
        categoryStats[category] = { count: 0, totalRaised: 0 };
      }
      categoryStats[category].count++;
      categoryStats[category].totalRaised += campaign.current_funding || 0;
    });

    const byCategory = Object.entries(categoryStats).map(([category, stats]) => ({
      category,
      count: stats.count,
      totalRaised: stats.totalRaised
    }));

    // Campaigns by status
    const statusStats = {};
    campaigns?.forEach(campaign => {
      const status = campaign.status || 'unknown';
      statusStats[status] = (statusStats[status] || 0) + 1;
    });

    const byStatus = Object.entries(statusStats).map(([status, count]) => ({
      status,
      count,
      percentage: (count / totalCampaigns) * 100
    }));

    // FIX: Enhanced top performing campaigns with contributor count
    const topPerforming = await Promise.all(
      (campaigns || [])
        .sort((a, b) => (b.current_funding || 0) - (a.current_funding || 0))
        .slice(0, 5)
        .map(async (campaign) => {
          // Get contributor count for each campaign
          const { data: campaignContributions } = await supabase
            .from('contributions')
            .select('contributor_id')
            .eq('campaign_id', campaign.id)
            .eq('status', 'completed');

          // Count unique contributors
          const uniqueContributors = new Set(
            campaignContributions?.map(c => c.contributor_id) || []
          );

          return {
            id: campaign.id,
            title: campaign.title || `Campaign ${campaign.id.slice(0, 8)}`, // Fallback to partial ID if no title
            raised: campaign.current_funding || 0,
            goal: campaign.funding_goal || 0,
            contributors: uniqueContributors.size
          };
        })
    );

    // Users by role
    const roleStats = {};
    users?.forEach(user => {
      const role = user.role || 'user';
      roleStats[role] = (roleStats[role] || 0) + 1;
    });

    const byRole = Object.entries(roleStats).map(([role, count]) => ({
      role,
      count,
      percentage: totalUsers > 0 ? (count / totalUsers) * 100 : 0
    }));

    // Payment methods distribution
    const paymentMethodStats = {};
    contributions?.forEach(contribution => {
      const method = contribution.payment_method || 'unknown';
      paymentMethodStats[method] = (paymentMethodStats[method] || 0) + 1;
    });

    const paymentMethods = Object.entries(paymentMethodStats).map(([method, count]) => ({
      method,
      count,
      percentage: totalContributions > 0 ? (count / totalContributions) * 100 : 0
    }));

    // Daily contribution trend (last 7 days)
    const dailyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayContributions = contributions?.filter(c => 
        c.created_at.startsWith(dateStr)
      ) || [];
      
      dailyTrend.push({
        date: dateStr,
        amount: dayContributions.reduce((sum, c) => sum + (c.amount || 0), 0),
        count: dayContributions.length
      });
    }

    const analyticsData = {
      overview: {
        totalUsers,
        totalCampaigns,
        totalRaised,
        totalContributions,
        growthMetrics: {
          userGrowth,
          campaignGrowth,
          revenueGrowth,
          contributionGrowth
        }
      },
      campaigns: {
        byCategory,
        byStatus,
        topPerforming
      },
      users: {
        registrationTrend: [], // You can implement this if needed
        byRole,
        activeUsers: totalUsers // Simplified - you might want to calculate actual active users
      },
      contributions: {
        dailyTrend,
        averageContribution: totalContributions > 0 ? totalRaised / totalContributions : 0,
        paymentMethods
      }
    };

    res.json(analyticsData);

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Server error fetching analytics' });
  }
});

// Export analytics data
router.get('/analytics/export', async (req, res) => {
  try {
    const { days = '30' } = req.query;
    
    // Get analytics data (reuse the analytics endpoint logic)
    const analyticsResponse = await new Promise((resolve, reject) => {
      // Call the analytics endpoint internally
      const mockReq = { query: { days } };
      const mockRes = {
        json: (data) => resolve(data),
        status: () => ({ json: (error) => reject(error) })
      };
      
      // You would call your analytics logic here
      // For now, return a simple CSV
    });

    const csvContent = `Analytics Export for Last ${days} Days\n\nThis feature is under development.`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics_${days}days.csv`);
    res.send(csvContent);

  } catch (error) {
    console.error('Analytics export error:', error);
    res.status(500).json({ error: 'Server error during analytics export' });
  }
});

// Get platform settings
router.get('/settings', async (req, res) => {
  try {
    // Fetch all settings from database
    const { data: settingsData, error } = await supabase
      .from('platform_settings')
      .select('setting_key, setting_value, category')
      .order('category', { ascending: true });

    if (error) {
      console.error('Error fetching settings:', error);
      return res.status(500).json({ error: 'Failed to fetch platform settings' });
    }

    // Group settings by category
    const settings = {};
    
    settingsData?.forEach(setting => {
      if (!settings[setting.category]) {
        settings[setting.category] = {};
      }
      
      // Parse JSON value with better error handling
      let value = setting.setting_value;
      
      // Handle different value types more carefully
      if (typeof value === 'string') {
        try {
          // Only try to parse if it looks like JSON (starts with quotes, brackets, or is a boolean/number)
          if (value.startsWith('"') || value.startsWith('[') || value.startsWith('{') || 
              value === 'true' || value === 'false' || !isNaN(Number(value))) {
            value = JSON.parse(value);
          }
          // Otherwise, keep as string (it's likely a raw string value)
        } catch (e) {
          // If parsing fails, keep the original string value
          console.warn(`Keeping setting ${setting.setting_key} as string:`, value);
        }
      }
      
      settings[setting.category][setting.setting_key] = value;
    });

    // Ensure all expected categories exist with defaults if missing
    const defaultCategories = {
      general: {
        platform_name: 'Transcends Corp',
        platform_description: 'Kenya\'s leading crowdfunding platform connecting dreamers with supporters',
        support_email: 'transcends.corp@gmail.com',
        platform_url: 'https://transcends.com',
        maintenance_mode: false,
        registration_enabled: true
      },
      campaigns: {
        approval_required: true,
        max_campaign_duration: 90,
        min_funding_goal: 10000,
        max_funding_goal: 10000000,
        featured_campaigns_limit: 10,
        allowed_categories: [
          'Education', 'Healthcare', 'Technology', 'Environment', 
          'Agriculture', 'Community Development', 'Arts & Culture', 
          'Emergency Relief', 'Sports & Recreation', 'Other'
        ]
      },
      payments: {
        platform_fee_percentage: 5.0,
        minimum_contribution: 100,
        maximum_contribution: 1000000,
        payment_methods: ['M-Pesa', 'Bank Transfer', 'Card'],
        refund_policy: 'Refunds are processed within 7-14 business days. Campaign creators must approve refund requests for contributions made to their campaigns.'
      },
      users: {
        email_verification_required: true,
        organization_approval_required: true,
        max_campaigns_per_user: 5,
        account_deletion_enabled: true
      },
      notifications: {
        email_notifications_enabled: true,
        sms_notifications_enabled: false,
        campaign_updates_enabled: true,
        system_alerts_enabled: true
      },
      security: {
        password_min_length: 8,
        session_timeout_minutes: 60,
        max_login_attempts: 5,
        two_factor_required: false
      }
    };

    // Merge defaults with database values, normalizing property names
    Object.keys(defaultCategories).forEach(category => {
      if (!settings[category]) {
        settings[category] = defaultCategories[category];
      } else {
        // Normalize property names by converting underscores to camelCase
        const normalizedSettings = {};
        Object.keys(settings[category]).forEach(key => {
          const camelCaseKey = key.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
          normalizedSettings[camelCaseKey] = settings[category][key];
        });
        
        settings[category] = { ...defaultCategories[category], ...normalizedSettings };
      }
    });

    res.json(settings);

  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({ error: 'Server error fetching settings' });
  }
});

// Update platform settings
router.put('/settings', async (req, res) => {
  try {
    const settings = req.body;
    const adminId = req.user.id;

    // Validate input
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings data' });
    }

    const updatePromises = [];

    // Process each category
    Object.keys(settings).forEach(category => {
      const categorySettings = settings[category];
      
      if (categorySettings && typeof categorySettings === 'object') {
        Object.keys(categorySettings).forEach(key => {
          const value = categorySettings[key];
          
          // Convert camelCase back to snake_case for database storage
          const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          
          // Convert value to proper JSON format for storage
          let jsonValue;
          if (typeof value === 'string') {
            jsonValue = JSON.stringify(value);
          } else if (typeof value === 'boolean' || typeof value === 'number') {
            jsonValue = JSON.stringify(value);
          } else if (Array.isArray(value) || typeof value === 'object') {
            jsonValue = JSON.stringify(value);
          } else {
            jsonValue = JSON.stringify(String(value));
          }
          
          updatePromises.push(
            supabase
              .from('platform_settings')
              .upsert({
                setting_key: dbKey,
                setting_value: jsonValue,
                category: category,
                updated_by: adminId,
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'setting_key'
              })
          );
        });
      }
    });

    // Execute all updates
    const results = await Promise.all(updatePromises);
    
    // Check for errors
    const errors = results.filter(result => result.error);
    if (errors.length > 0) {
      console.error('Settings update errors:', errors);
      return res.status(500).json({ error: 'Some settings failed to update' });
    }

    console.log(`Settings updated by admin ${adminId}:`, Object.keys(settings));

    res.json({
      message: 'Settings updated successfully',
      updatedCategories: Object.keys(settings),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Server error updating settings' });
  }
});

// Update specific category settings
router.patch('/settings/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const updates = req.body;
    const adminId = req.user.id;

    // Validate category
    const validCategories = ['general', 'campaigns', 'payments', 'users', 'notifications', 'security'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid settings category' });
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid update data' });
    }

    const updatePromises = [];

    // Process each setting in the category
    Object.keys(updates).forEach(key => {
      const value = updates[key];
      const jsonValue = JSON.stringify(value);
      
      updatePromises.push(
        supabase
          .from('platform_settings')
          .upsert({
            setting_key: key,
            setting_value: jsonValue,
            category: category,
            updated_by: adminId,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'setting_key'
          })
      );
    });

    // Execute all updates
    const results = await Promise.all(updatePromises);
    
    // Check for errors
    const errors = results.filter(result => result.error);
    if (errors.length > 0) {
      console.error(`Settings update errors for category ${category}:`, errors);
      return res.status(500).json({ error: 'Some settings failed to update' });
    }

    console.log(`Category ${category} settings updated by admin ${adminId}:`, Object.keys(updates));

    res.json({
      message: `${category} settings updated successfully`,
      category,
      updatedKeys: Object.keys(updates),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Category settings update error:', error);
    res.status(500).json({ error: 'Server error updating category settings' });
  }
});

// Reset settings to defaults
router.post('/settings/reset', async (req, res) => {
  try {
    const adminId = req.user.id;

    // Delete all existing settings
    const { error: deleteError } = await supabase
      .from('platform_settings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.error('Error deleting settings:', deleteError);
      return res.status(500).json({ error: 'Failed to reset settings' });
    }

    // Re-insert default settings
    const defaultSettings = [
      // General settings
      { setting_key: 'platform_name', setting_value: '"Transcends Corp"', category: 'general', description: 'Name of the crowdfunding platform', updated_by: adminId },
      { setting_key: 'platform_description', setting_value: '"Kenya\'s leading crowdfunding platform connecting dreamers with supporters"', category: 'general', description: 'Platform description', updated_by: adminId },
      { setting_key: 'support_email', setting_value: '"transcends.corp@gmail.com"', category: 'general', description: 'Support contact email', updated_by: adminId },
      { setting_key: 'platform_url', setting_value: '"https://transcends.com"', category: 'general', description: 'Main platform URL', updated_by: adminId },
      { setting_key: 'maintenance_mode', setting_value: 'false', category: 'general', description: 'Enable/disable maintenance mode', updated_by: adminId },
      { setting_key: 'registration_enabled', setting_value: 'true', category: 'general', description: 'Allow new user registrations', updated_by: adminId },

      // Campaign settings
      { setting_key: 'approval_required', setting_value: 'true', category: 'campaigns', description: 'Require admin approval for new campaigns', updated_by: adminId },
      { setting_key: 'max_campaign_duration', setting_value: '90', category: 'campaigns', description: 'Maximum campaign duration in days', updated_by: adminId },
      { setting_key: 'min_funding_goal', setting_value: '10000', category: 'campaigns', description: 'Minimum funding goal in KES', updated_by: adminId },
      { setting_key: 'max_funding_goal', setting_value: '10000000', category: 'campaigns', description: 'Maximum funding goal in KES', updated_by: adminId },
      { setting_key: 'featured_campaigns_limit', setting_value: '10', category: 'campaigns', description: 'Number of featured campaigns on homepage', updated_by: adminId },
      { setting_key: 'allowed_categories', setting_value: '["Education", "Healthcare", "Technology", "Environment", "Agriculture", "Community Development", "Arts & Culture", "Emergency Relief", "Sports & Recreation", "Other"]', category: 'campaigns', description: 'Allowed campaign categories', updated_by: adminId },

      // Payment settings
      { setting_key: 'platform_fee_percentage', setting_value: '5.0', category: 'payments', description: 'Platform fee percentage', updated_by: adminId },
      { setting_key: 'minimum_contribution', setting_value: '100', category: 'payments', description: 'Minimum contribution amount in KES', updated_by: adminId },
      { setting_key: 'maximum_contribution', setting_value: '1000000', category: 'payments', description: 'Maximum contribution amount in KES', updated_by: adminId },
      { setting_key: 'payment_methods', setting_value: '["M-Pesa", "Bank Transfer", "Card"]', category: 'payments', description: 'Available payment methods', updated_by: adminId },
      { setting_key: 'refund_policy', setting_value: '"Refunds are processed within 7-14 business days. Campaign creators must approve refund requests for contributions made to their campaigns."', category: 'payments', description: 'Platform refund policy', updated_by: adminId },

      // User settings
      { setting_key: 'email_verification_required', setting_value: 'true', category: 'users', description: 'Require email verification for new accounts', updated_by: adminId },
      { setting_key: 'organization_approval_required', setting_value: 'true', category: 'users', description: 'Require admin approval for organization accounts', updated_by: adminId },
      { setting_key: 'max_campaigns_per_user', setting_value: '5', category: 'users', description: 'Maximum campaigns per user', updated_by: adminId },
      { setting_key: 'account_deletion_enabled', setting_value: 'true', category: 'users', description: 'Allow users to delete their own accounts', updated_by: adminId },

      // Notification settings
      { setting_key: 'email_notifications_enabled', setting_value: 'true', category: 'notifications', description: 'Enable email notifications', updated_by: adminId },
      { setting_key: 'sms_notifications_enabled', setting_value: 'false', category: 'notifications', description: 'Enable SMS notifications', updated_by: adminId },
      { setting_key: 'campaign_updates_enabled', setting_value: 'true', category: 'notifications', description: 'Enable campaign update notifications', updated_by: adminId },
      { setting_key: 'system_alerts_enabled', setting_value: 'true', category: 'notifications', description: 'Enable system alert notifications', updated_by: adminId },

      // Security settings
      { setting_key: 'password_min_length', setting_value: '8', category: 'security', description: 'Minimum password length', updated_by: adminId },
      { setting_key: 'session_timeout_minutes', setting_value: '60', category: 'security', description: 'Session timeout in minutes', updated_by: adminId },
      { setting_key: 'max_login_attempts', setting_value: '5', category: 'security', description: 'Maximum failed login attempts before lockout', updated_by: adminId },
      { setting_key: 'two_factor_required', setting_value: 'false', category: 'security', description: 'Require two-factor authentication for admin accounts', updated_by: adminId }
    ];

    const { error: insertError } = await supabase
      .from('platform_settings')
      .insert(defaultSettings);

    if (insertError) {
      console.error('Error inserting default settings:', insertError);
      return res.status(500).json({ error: 'Failed to restore default settings' });
    }

    console.log(`Settings reset to defaults by admin ${adminId}`);

    // Return the default settings grouped by category
    const resetSettings = {
      general: {
        platformName: 'Transcends Corp',
        platformDescription: 'Kenya\'s leading crowdfunding platform connecting dreamers with supporters',
        supportEmail: 'transcends.corp@gmail.com',
        platformUrl: 'https://transcends.com',
        maintenanceMode: false,
        registrationEnabled: true
      },
      campaigns: {
        approvalRequired: true,
        maxCampaignDuration: 90,
        minFundingGoal: 10000,
        maxFundingGoal: 10000000,
        featuredCampaignsLimit: 10,
        allowedCategories: [
          'Education', 'Healthcare', 'Technology', 'Environment', 
          'Agriculture', 'Community Development', 'Arts & Culture', 
          'Emergency Relief', 'Sports & Recreation', 'Other'
        ]
      },
      payments: {
        platformFeePercentage: 5.0,
        minimumContribution: 100,
        maximumContribution: 1000000,
        paymentMethods: ['M-Pesa', 'Bank Transfer', 'Card'],
        refundPolicy: 'Refunds are processed within 7-14 business days. Campaign creators must approve refund requests for contributions made to their campaigns.'
      },
      users: {
        emailVerificationRequired: true,
        organizationApprovalRequired: true,
        maxCampaignsPerUser: 5,
        accountDeletionEnabled: true
      },
      notifications: {
        emailNotificationsEnabled: true,
        smsNotificationsEnabled: false,
        campaignUpdatesEnabled: true,
        systemAlertsEnabled: true
      },
      security: {
        passwordMinLength: 8,
        sessionTimeoutMinutes: 60,
        maxLoginAttempts: 5,
        twoFactorRequired: false
      }
    };

    res.json({
      message: 'Settings reset to defaults successfully',
      settings: resetSettings,
      resetBy: adminId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Settings reset error:', error);
    res.status(500).json({ error: 'Server error resetting settings' });
  }
});

// Get all payments (admin only) - OPTIMIZED VERSION
router.get('/payments', authenticate, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const { page = 1, limit = 20, status, payment_method } = req.query;
    const offset = (page - 1) * limit;

    // OPTIMIZATION 1: Use a single optimized query with all needed data
    let paymentsQuery = supabase
      .from('contributions')
      .select(`
        id,
        amount,
        status,
        payment_method,
        transaction_id,
        mpesa_phone_number,
        created_at,
        processed_at,
        result_desc,
        campaign_id,
        contributor_id,
        campaigns!inner (
          id,
          title,
          creator_id,
          profiles!campaigns_creator_id_fkey (
            id,
            name,
            role
          )
        ),
        profiles!contributions_contributor_id_fkey (
          id,
          name,
          email
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    // Apply filters
    if (status && status !== 'all') {
      paymentsQuery = paymentsQuery.eq('status', status);
    }
    if (payment_method && payment_method !== 'all') {
      paymentsQuery = paymentsQuery.eq('payment_method', payment_method);
    }

    // OPTIMIZATION 2: Run queries in parallel
    const [paymentsResult, countResult, statsResult] = await Promise.all([
      paymentsQuery,
      supabase
        .from('contributions')
        .select('*', { count: 'exact', head: true }),
      // Pre-calculate stats in a single query
      supabase
        .from('contributions')
        .select('status, amount, created_at')
    ]);

    const { data: payments, error: paymentsError } = paymentsResult;
    const { count: totalCount } = countResult;
    const { data: allContributions } = statsResult;

    if (paymentsError) {
      console.error('Error fetching payments:', paymentsError);
      return res.status(500).json({ error: 'Failed to fetch payments' });
    }

    // OPTIMIZATION 3: Batch process organization data for creators
    const creatorIds = [...new Set(payments?.map(p => p.campaigns?.profiles?.id).filter(Boolean))];
    const organizationsData = creatorIds.length > 0 ? await supabase
      .from('organizations')
      .select('user_id, organization_name')
      .in('user_id', creatorIds) : { data: [] };

    const orgMap = new Map(
      organizationsData.data?.map(org => [org.user_id, org.organization_name]) || []
    );

    // OPTIMIZATION 4: Transform data efficiently
    const transformedPayments = payments?.map(payment => ({
      ...payment,
      campaign: {
        id: payment.campaigns?.id || payment.campaign_id,
        title: payment.campaigns?.title || 'Unknown Campaign',
        creator_id: payment.campaigns?.creator_id,
        creator: {
          id: payment.campaigns?.profiles?.id || payment.campaigns?.creator_id,
          name: payment.campaigns?.profiles?.name || 'Unknown Creator',
          organization_name: orgMap.get(payment.campaigns?.profiles?.id) || null
        }
      },
      contributor: {
        id: payment.profiles?.id || payment.contributor_id,
        name: payment.profiles?.name || 'Unknown User',
        email: payment.profiles?.email || 'unknown@email.com'
      }
    })) || [];

    // OPTIMIZATION 5: Calculate stats efficiently
    const completedContributions = allContributions?.filter(c => c.status === 'completed') || [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayContributions = completedContributions.filter(c => 
      new Date(c.created_at) >= todayStart
    );

    const stats = {
      totalAmount: completedContributions.reduce((sum, c) => sum + (c.amount || 0), 0),
      totalCount: allContributions?.length || 0,
      successfulPayments: completedContributions.length,
      failedPayments: allContributions?.filter(c => c.status === 'failed').length || 0,
      pendingPayments: allContributions?.filter(c => c.status === 'pending').length || 0,
      averageAmount: completedContributions.length > 0 
        ? completedContributions.reduce((sum, c) => sum + (c.amount || 0), 0) / completedContributions.length 
        : 0,
      monthlyGrowth: 0 // Can be calculated if needed
    };

    // OPTIMIZATION 6: Set appropriate cache headers
    res.set('Cache-Control', 'private, max-age=30'); // Cache for 30 seconds

    res.json({
      payments: transformedPayments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount || 0,
        pages: Math.ceil((totalCount || 0) / parseInt(limit))
      },
      stats
    });

  } catch (error) {
    console.error('Error in admin payments endpoint:', error);
    res.status(500).json({ error: 'Server error fetching payments' });
  }
});

// Get specific payment details
router.get('/payments/:paymentId', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { paymentId } = req.params;

    const { data: payment, error } = await supabase
      .from('contributions')
      .select(`
        *,
        campaigns!contributions_campaign_id_fkey (
          id,
          title,
          description,
          creator_id,
          status
        ),
        profiles!contributions_contributor_id_fkey (
          id,
          name,
          email,
          role
        )
      `)
      .eq('id', paymentId)
      .single();

    if (error || !payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);

  } catch (error) {
    console.error('Error fetching payment details:', error);
    res.status(500).json({ error: 'Error fetching payment details' });
  }
});

// Export contributions data (legacy endpoint, consider removing if not needed)
router.get('/export', async (req, res) => {
  try {
    // Get all contributions with details
    const { data: contributions, error } = await supabase
      .from('contributions')
      .select(`
        *,
        campaigns!contributions_campaign_id_fkey (
          title
        ),
        profiles!contributions_contributor_id_fkey (
          name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch contributions for export' });
    }

    // Create CSV content
    const headers = ['Date', 'Contributor Name', 'Contributor Email', 'Campaign', 'Amount', 'Status', 'Payment Method', 'Transaction ID'];
    const csvRows = [headers.join(',')];

    contributions?.forEach(contribution => {
      const row = [
        new Date(contribution.created_at).toLocaleDateString(),
        contribution.profiles?.name || 'Unknown',
        contribution.profiles?.email || 'Unknown',
        contribution.campaigns?.title || 'Unknown',
        contribution.amount || 0,
        contribution.status || 'unknown',
        contribution.payment_method || 'unknown',
        contribution.transaction_id || 'N/A'
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contributions.csv');
    res.send(csvContent);

  } catch (error) {
    console.error('Error exporting contributions:', error);
    res.status(500).json({ error: 'Server error during export' });
  }
});

module.exports = router;
