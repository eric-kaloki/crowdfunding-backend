const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticate);

// Get organization profile for logged-in user
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: organization, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error fetching organization profile:', error);
      return res.status(500).json({ error: 'Failed to fetch organization profile' });
    }

    if (!organization) {
      // If no organization record exists, create a basic one for organization users
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('name, role')
        .eq('id', userId)
        .single();

      if (userProfile && userProfile.role === 'organization') {
        // Create a minimal organization record
        const { data: newOrg, error: createError } = await supabase
          .from('organizations')
          .insert({
            user_id: userId,
            organization_name: userProfile.name,
            organization_description: 'Please update your organization description',
            contact_person: userProfile.name,
            approval_status: 'pending'
          })
          .select('*')
          .single();

        if (createError) {
          console.error('Error creating organization record:', createError);
          return res.status(500).json({ error: 'Failed to create organization profile' });
        }

        return res.json(newOrg);
      }

      return res.status(404).json({ error: 'Organization profile not found' });
    }

    res.json(organization);
  } catch (error) {
    console.error('Organization profile fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload registration certificate
router.post('/upload-certificate', async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('Certificate upload request from user:', userId);

    if (!req.files || !req.files.certificate) {
      console.log('No certificate file in request');
      return res.status(400).json({ error: 'No certificate file uploaded' });
    }

    const certificateFile = req.files.certificate;
    console.log('Certificate file details:', {
      name: certificateFile.name,
      mimetype: certificateFile.mimetype,
      size: certificateFile.size
    });
    
    // Validate file type and size
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(certificateFile.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type. Only PDF, JPG, PNG files are allowed.' });
    }

    if (certificateFile.size > 10 * 1024 * 1024) { // 10MB limit
      return res.status(400).json({ error: 'File size too large. Maximum 10MB allowed.' });
    }

    // Check if organization exists, create if it doesn't
    let organization;
    const { data: existingOrg, error: fetchError } = await supabase
      .from('organizations')
      .select('id, organization_name')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code === 'PGRST116') {
      // Organization doesn't exist, create it
      console.log('Organization not found, creating new record for user:', userId);
      
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', userId)
        .single();

      const { data: newOrg, error: createError } = await supabase
        .from('organizations')
        .insert({
          user_id: userId,
          organization_name: userProfile?.name || 'Organization',
          organization_description: 'Please update your organization description',
          contact_person: userProfile?.name || 'Contact Person',
          approval_status: 'pending'
        })
        .select('id, organization_name')
        .single();

      if (createError) {
        console.error('Error creating organization:', createError);
        return res.status(500).json({ error: 'Failed to create organization profile' });
      }

      organization = newOrg;
    } else if (fetchError) {
      console.error('Error fetching organization:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch organization profile' });
    } else {
      organization = existingOrg;
    }

    console.log('Found/created organization:', organization.organization_name);

    // Generate unique filename
    const fileExtension = certificateFile.name.split('.').pop();
    const fileName = `certificate_${userId}_${Date.now()}.${fileExtension}`;
    
    console.log('Uploading file to storage:', fileName);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('organization-certificates')
      .upload(fileName, certificateFile.data, {
        contentType: certificateFile.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('Certificate upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload certificate to storage' });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('organization-certificates')
      .getPublicUrl(fileName);

    const certificateUrl = urlData.publicUrl;
    console.log('Generated certificate URL:', certificateUrl);

    // Update organization record with certificate URL
    const { data: updatedOrg, error: updateError } = await supabase
      .from('organizations')
      .update({ 
        registration_certificate_url: certificateUrl,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError) {
      console.error('Database update error:', updateError);
      return res.status(500).json({ 
        error: 'Failed to update organization record',
        details: updateError.message 
      });
    }

    console.log('Organization updated successfully with certificate URL');

    res.json({
      message: 'Certificate uploaded successfully',
      certificate_url: certificateUrl,
      organization: updatedOrg
    });

  } catch (error) {
    console.error('Certificate upload error:', error);
    res.status(500).json({ error: 'Server error during certificate upload' });
  }
});

// Update organization profile
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const { organization_name, organization_description, organization_registration_number, contact_person } = req.body;

    // Validate required fields
    if (!organization_name?.trim()) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    if (!organization_description?.trim()) {
      return res.status(400).json({ error: 'Organization description is required' });
    }

    const updateData = {
      organization_name: organization_name.trim(),
      organization_description: organization_description.trim(),
      organization_registration_number: organization_registration_number?.trim() || null,
      contact_person: contact_person?.trim() || null,
      updated_at: new Date().toISOString()
    };

    const { data: updatedOrg, error: updateError } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError) {
      console.error('Organization update error:', updateError);
      return res.status(500).json({ error: 'Failed to update organization profile' });
    }

    res.json({
      message: 'Organization profile updated successfully',
      organization: updatedOrg
    });

  } catch (error) {
    console.error('Organization profile update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
