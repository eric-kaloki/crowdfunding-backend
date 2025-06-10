const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// Get current user profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, name, email, phone, role, verification_status, profile_picture, bio, location, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch profile' });
    }

    // Get organization details if user is organization
    if (profile.role === 'organization') {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      profile.organization = orgData;
    }

    res.json(profile);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile information
router.patch('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone, bio, location, currentPassword, newPassword } = req.body;

    // Validate current password if changing password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to change password' });
      }

      const { data: user } = await supabase
        .from('profiles')
        .select('password')
        .eq('id', userId)
        .single();

      if (!user || !await bcrypt.compare(currentPassword, user.password)) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (name) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (bio !== undefined) updateData.bio = bio?.trim() || null;
    if (location !== undefined) updateData.location = location?.trim() || null;
    
    if (newPassword) {
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select('id, name, email, phone, role, verification_status, profile_picture, bio, location, created_at, updated_at')
      .single();

    if (error) {
      console.error('Profile update error:', error);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    res.json(updatedProfile);
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload profile picture - simplified to use express-fileupload
router.post('/upload-picture', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('Profile picture upload request received');
    console.log('Files:', req.files);
    console.log('Body:', req.body);

    if (!req.files || !req.files.profilePicture) {
      console.log('No file received in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.files.profilePicture;

    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are allowed' });
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size must be less than 5MB' });
    }

    // Create upload directory
    const uploadDir = 'uploads/profiles';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = `profile-${userId}-${uniqueSuffix}${path.extname(file.name)}`;
    const filepath = path.join(uploadDir, filename);

    // Move file to upload directory
    await file.mv(filepath);

    // Create the profile picture URL
    const profilePictureUrl = `/uploads/profiles/${filename}`;

    console.log('Generated profile picture URL:', profilePictureUrl);

    // Update profile with new picture URL
    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update({
        profile_picture: profilePictureUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('profile_picture')
      .single();

    if (error) {
      console.error('Database update error:', error);
      // Delete uploaded file if database update fails
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      return res.status(500).json({ error: 'Failed to update profile picture' });
    }

    console.log('Profile picture updated successfully:', updatedProfile);

    res.json({
      message: 'Profile picture updated successfully',
      profile_picture: updatedProfile.profile_picture
    });

  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({ error: 'Server error during upload' });
  }
});

// Update organization profile (for organization users)
router.patch('/organization', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { organization_name, organization_description, organization_registration_number, contact_person } = req.body;

    // Verify user is organization
    const { data: user } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (!user || user.role !== 'organization') {
      return res.status(403).json({ error: 'Only organization users can update organization profile' });
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (organization_name) updateData.organization_name = organization_name.trim();
    if (organization_description) updateData.organization_description = organization_description.trim();
    if (organization_registration_number !== undefined) {
      updateData.organization_registration_number = organization_registration_number?.trim() || null;
    }
    if (contact_person) updateData.contact_person = contact_person.trim();

    const { data: updatedOrg, error } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      console.error('Organization update error:', error);
      return res.status(500).json({ error: 'Failed to update organization profile' });
    }

    res.json(updatedOrg);
  } catch (error) {
    console.error('Organization profile update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete profile picture
router.delete('/picture', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current profile picture
    const { data: profile } = await supabase
      .from('profiles')
      .select('profile_picture')
      .eq('id', userId)
      .single();

    if (profile?.profile_picture) {
      // Delete file from filesystem
      const filePath = path.join(process.cwd(), profile.profile_picture);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Update profile to remove picture URL
    const { error } = await supabase
      .from('profiles')
      .update({
        profile_picture: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      return res.status(500).json({ error: 'Failed to remove profile picture' });
    }

    res.json({ message: 'Profile picture removed successfully' });

  } catch (error) {
    console.error('Profile picture deletion error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get public profile (for viewing other users) - Update existing endpoint
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, name, role, verification_status, profile_picture, bio, location, created_at')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get organization details if user is organization
    if (profile.role === 'organization') {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, organization_name, organization_description, organization_registration_number, approval_status, registration_certificate_url')
        .eq('user_id', userId)
        .single();
      
      profile.organization = orgData;
    }

    res.json(profile);
  } catch (error) {
    console.error('Public profile fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
