const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// Debug middleware
router.use((req, res, next) => {
  console.log('Organization route accessed:', req.method, req.path, 'User:', req.user?.id);
  next();
});

// Apply authentication to all routes
router.use(authenticate);

// Get organization profile for logged-in user
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Fetching organization profile for user:', userId);

    // First check if user exists and has organization role
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id, role, name, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('User not found:', userError);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('User found:', user);

    // Check if user has organization role
    if (user.role !== 'organization') {
      console.log('User is not an organization:', user.role);
      return res.status(403).json({ error: 'User is not an organization' });
    }

    // Try to find organization record
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('user_id', userId)
      .single();

    console.log('Organization query result:', { organization, error: orgError });

    if (orgError && orgError.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error fetching organization profile:', orgError);
      return res.status(500).json({ error: 'Failed to fetch organization profile' });
    }

    if (!organization) {
      console.log('No organization record found for user:', userId);
      return res.status(404).json({ 
        error: 'Organization profile not found. Please contact support to complete your organization setup.' 
      });
    }

    console.log('Returning organization profile:', organization);
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

    // First check if user has organization role
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id, role, name, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('User not found for certificate upload:', userId, userError);
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'organization') {
      console.error('User is not an organization:', user.role);
      return res.status(403).json({ error: 'Only organizations can upload certificates' });
    }

    // Check if organization exists - DO NOT create if it doesn't
    const { data: existingOrg, error: fetchError } = await supabase
      .from('organizations')
      .select('id, organization_name')
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingOrg) {
      console.error('Organization record not found for user:', userId, fetchError);
      return res.status(404).json({ 
        error: 'Organization profile not found. Please contact support to complete your organization setup.' 
      });
    }

    console.log('Found organization:', existingOrg.organization_name);

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

    console.log('File uploaded successfully:', uploadData);

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
