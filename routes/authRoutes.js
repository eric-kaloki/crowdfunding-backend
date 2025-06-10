const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { generateOTP, sendOTP, checkOTP, storeOTP, sendEmail, verifyToken, verifyGoogleToken, verifyFirebaseToken } = require('../utils/otpUtils');

// Register route
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role, organizationData } = req.body;

    console.log('Registration request received for:', email);

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      console.log('User already exists:', email);
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    console.log('Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user profile (initially unverified)
    console.log('Creating user profile...');
    const { data: newUser, error: userError } = await supabase
      .from('profiles')
      .insert({
        name,
        email,
        password: hashedPassword,
        phone,
        role: role || 'user',
        verification_status: 'pending'
      })
      .select()
      .single();

    if (userError) {
      console.error('User creation error:', userError);
      return res.status(500).json({ error: 'Failed to create user' });
    }

    console.log('User created successfully:', newUser.id);

    // Handle organization creation asynchronously to speed up response
    if (role === 'organization' && organizationData) {
      console.log('Creating organization record...');
      // Don't await this - handle it asynchronously
      supabase
        .from('organizations')
        .insert({
          user_id: newUser.id,
          organization_name: organizationData.organizationName,
          organization_description: organizationData.organizationDescription,
          organization_registration_number: organizationData.registrationNumber,
          contact_person: organizationData.contactPerson || name,
          approval_status: 'pending' // Ensure this is set correctly
        })
        .then(({ error: orgError }) => {
          if (orgError) {
            console.error('Organization creation error (async):', orgError);
          } else {
            console.log('Organization record created successfully');
          }
        });
    }

    // Generate and send OTP asynchronously to speed up response
    console.log('Generating OTP...');
    const otp = generateOTP();
    
    // Store OTP and send email in parallel
    Promise.all([
      storeOTP(email, otp),
      sendOTP(email, otp)
    ]).then(() => {
      console.log('OTP sent successfully to:', email);
    }).catch((otpError) => {
      console.error('OTP sending error (async):', otpError);
    });

    // Send response immediately without waiting for email
    console.log('Sending registration response...');
    res.status(201).json({
      message: 'Account created successfully. Please verify your email with the OTP sent.',
      email
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login route - sends OTP if account not verified
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt for:', email);

    // Find user in profiles table
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (userError || !user) {
      console.log('User not found:', userError);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('User found:', { id: user.id, email: user.email, role: user.role, status: user.verification_status });

    // Verify password first
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is verified
    if (user.verification_status !== 'verified') {
      // Generate and send OTP for verification
      const otp = generateOTP();
      await storeOTP(email, otp);
      await sendOTP(email, otp);
      
      console.log('Account not verified, OTP sent to:', email);
      
      return res.status(200).json({ 
        needsVerification: true,
        message: 'Account not verified. We have sent a verification code to your email.',
        email: email
      });
    }

    // Generate JWT token for verified users
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    console.log('Login successful for:', email);

    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// OTP verification route - activates account and logs in
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const isValidOTP = await checkOTP(email, otp);
    if (!isValidOTP) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired OTP' 
      });
    }

    // Update user verification status
    const { data: updatedUser, error: updateError } = await supabase
      .from('profiles')
      .update({ verification_status: 'verified' })
      .eq('email', email)
      .select('*')
      .single();

    if (updateError) {
      console.error('Verification update error:', updateError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to verify account' 
      });
    }

    // Generate JWT token for newly verified user
    const token = jwt.sign(
      { 
        userId: updatedUser.id, 
        email: updatedUser.email, 
        role: updatedUser.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = updatedUser;

    res.json({
      success: true,
      message: 'Email verified successfully!',
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during verification' 
    });
  }
});

// Resend OTP route
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('email, verification_status')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    if (user.verification_status === 'verified') {
      return res.status(400).json({ 
        success: false, 
        message: 'Account already verified' 
      });
    }

    // Generate and send new OTP
    const otp = generateOTP();
    await storeOTP(email, otp);
    await sendOTP(email, otp);

    res.json({
      success: true,
      message: 'New OTP sent successfully'
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// Forgot password route
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single();

    if (userError || !user) {
      // Don't reveal if user exists or not
      return res.json({ message: 'If the email exists, a reset link has been sent.' });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create reset link
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Send reset email
    await sendEmail(email, resetLink);

    res.json({ message: 'If the email exists, a reset link has been sent.' });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password route
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ password: hashedPassword })
      .eq('id', decoded.userId);

    if (updateError) {
      console.error('Password update error:', updateError);
      return res.status(500).json({ error: 'Failed to update password' });
    }

    res.json({ message: 'Password reset successfully' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Refresh token route
router.post('/refresh-token', authenticate, async (req, res) => {
  try {
    // User is already authenticated via middleware
    const user = req.user;

    // Generate new token
    const newToken = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: newToken,
      user
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get own profile
router.get('/profile/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Start with basic columns that should always exist
    let profileQuery = supabase
      .from('profiles')
      .select('id, name, email, phone, role, verification_status, created_at')
      .eq('id', userId)
      .single();

    const { data: profile, error: profileError } = await profileQuery;

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return res.status(500).json({ error: 'Failed to fetch profile' });
    }

    // Safely try to get additional columns that might not exist
    const additionalFields = {};
    const optionalColumns = ['profile_picture', 'bio', 'location', 'google_id', 'updated_at'];

    for (const column of optionalColumns) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select(column)
          .eq('id', userId)
          .single();

        if (!error && data) {
          additionalFields[column] = data[column];
        }
      } catch (error) {
        // Column doesn't exist, skip it
        console.log(`Column ${column} doesn't exist, skipping...`);
      }
    }

    // Merge all profile data
    const fullProfile = {
      ...profile,
      ...additionalFields
    };

    // If user is an organization, try to get organization data separately
    let organization = null;
    if (profile.role === 'organization') {
      try {
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('id, organization_name, organization_description, organization_registration_number, approval_status, registration_certificate_url')
          .eq('user_id', userId)
          .single();

        if (!orgError && orgData) {
          organization = orgData;
        }
      } catch (error) {
        console.log('Organization data not found or error:', error.message);
      }
    }

    // Format response
    const formattedProfile = {
      ...fullProfile,
      organization
    };

    res.json(formattedProfile);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get public profile by user ID
router.get('/profile/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    // Start with basic columns
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, role, verification_status, created_at')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Safely try to get additional columns
    const additionalFields = {};
    const optionalColumns = ['profile_picture', 'bio', 'location'];

    for (const column of optionalColumns) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select(column)
          .eq('id', userId)
          .single();

        if (!error && data) {
          additionalFields[column] = data[column];
        }
      } catch (error) {
        // Column doesn't exist, skip it
      }
    }

    // Merge profile data
    const fullProfile = {
      ...profile,
      ...additionalFields
    };

    // If user is an organization, get organization data
    let organization = null;
    if (profile.role === 'organization') {
      try {
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('id, organization_name, organization_description, approval_status')
          .eq('user_id', userId)
          .single();

        if (!orgError && orgData) {
          organization = orgData;
          
          // Don't show unverified or pending organization profiles to others
          if (organization.approval_status !== 'approved') {
            return res.status(404).json({ error: 'Profile not found' });
          }
        }
      } catch (error) {
        console.log('Organization data not found:', error.message);
      }
    }

    // Format response
    const formattedProfile = {
      ...fullProfile,
      organization
    };

    res.json(formattedProfile);
  } catch (error) {
    console.error('Public profile fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update own profile
router.patch('/profile/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone, bio, location } = req.body;

    // Build update data only with fields that exist
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone.trim();

    // Check if optional columns exist before updating
    const optionalFields = { bio, location };
    
    for (const [field, value] of Object.entries(optionalFields)) {
      if (value !== undefined) {
        try {
          // Test if column exists
          await supabase
            .from('profiles')
            .select(field)
            .eq('id', userId)
            .limit(1);
          
          updateData[field] = value.trim();
        } catch (error) {
          console.log(`Column ${field} doesn't exist, skipping...`);
        }
      }
    }

    // Try to add updated_at if column exists
    try {
      await supabase
        .from('profiles')
        .select('updated_at')
        .limit(1);
      
      updateData.updated_at = new Date().toISOString();
    } catch (error) {
      // Column doesn't exist, skip it
    }

    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select('id, name, email, phone, role')
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

// Google Auth endpoint (unified for both login and signup)
router.post('/google-auth', async (req, res) => {
  try {
    const { accessToken, userInfo, mode } = req.body;
    
    if (!accessToken || !userInfo) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { email, name, picture } = userInfo;

    console.log('Google auth attempt:', { email, mode });

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (mode === 'signup' && existingUser) {
      return res.status(400).json({ error: 'User already exists. Please sign in instead.' });
    }

    if (mode === 'signin' && !existingUser) {
      return res.status(404).json({ error: 'User not found. Please sign up first.' });
    }

    let user = existingUser;

    // Create user if doesn't exist (for signup mode)
    if (!existingUser && mode === 'signup') {
      const { data: newUser, error } = await supabase
        .from('profiles')
        .insert({
          email,
          name,
          role: 'user',
          verification_status: 'verified', // Google users are auto-verified
          profile_picture: picture,
          google_id: email // Use email as google_id for simplicity
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating Google user:', error);
        return res.status(500).json({ error: 'Failed to create user' });
      }

      user = newUser;
      console.log('New Google user created:', user.email);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    console.log('Google auth successful for:', user.email);

    res.json({
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

module.exports = router;
