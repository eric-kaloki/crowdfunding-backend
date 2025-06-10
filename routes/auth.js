const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// @route   POST api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  // Simple validation
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Please fill in all fields' });
  }

  try {
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        password: hashedPassword,
        name,
        role: 'user',
        verified: false // Set to false, needs email verification
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Send verification email
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: newUser.email,
      subject: 'Please verify your email',
      html: `<h1>Email Verification</h1>
             <p>Hello ${newUser.name},</p>
             <p>Thank you for registering. Please verify your email by clicking on the following link:</p>
             <p><a href="${process.env.FRONTEND_URL}/verify-email?token=${newUser.id}">Verify Email</a></p>
             <p>If you did not create an account, you can safely ignore this email.</p>`,
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({ message: 'User registered successfully, please check your email to verify your account' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// @route   POST api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Simple validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Please fill in all fields' });
  }

  try {
    // Check if user exists
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check if password matches
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check if user is verified
    if (!user.verified) {
      return res.status(403).json({ error: 'Please verify your email before logging in' });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        verified: user.verified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// @route   POST api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  // Simple validation
  if (!email) {
    return res.status(400).json({ error: 'Please provide your email' });
  }

  try {
    // Check if user exists
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Create password reset token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Store token in database (for example purposes, not secure)
    await supabase
      .from('users')
      .update({ passwordResetToken: resetToken })
      .eq('id', user.id);

    // Send password reset email
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: user.email,
      subject: 'Password Reset Request',
      html: `<h1>Password Reset</h1>
             <p>Hello ${user.name},</p>
             <p>You requested a password reset. Please click on the following link to reset your password:</p>
             <p><a href="${process.env.FRONTEND_URL}/reset-password?token=${resetToken}">Reset Password</a></p>
             <p>If you did not request this, you can ignore this email.</p>`,
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: 'Password reset link sent to your email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// @route   POST api/auth/reset-password
// @desc    Reset user password
// @access  Public
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  // Simple validation
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    // Find user by reset token
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('passwordResetToken', token)
      .single();

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await supabase
      .from('users')
      .update({ password: hashedPassword, passwordResetToken: null })
      .eq('id', user.id);

    res.json({ message: 'Password reset successful, you can now log in' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Simplified Google Auth endpoint
router.post('/google-auth', async (req, res) => {
  try {
    const { accessToken, userInfo, mode } = req.body;
    
    if (!accessToken || !userInfo) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { email, name, picture } = userInfo;

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
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

    // Create user if doesn't exist (for signup)
    if (!existingUser) {
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          email,
          name,
          role: 'user',
          verified: true,
          profile_picture: picture
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating user:', error);
        return res.status(500).json({ error: 'Failed to create user' });
      }

      user = newUser;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        verified: user.verified
      }
    });

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Google Login endpoint
router.post('/google-login', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }
    
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { email } = payload;

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found. Please sign up first.' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        verified: user.verified
      }
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(400).json({ error: 'Google login failed' });
  }
});

// Google Signup endpoint
router.post('/google-signup', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }
    
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists. Please sign in instead.' });
    }

    // Create new user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        name,
        role: 'user',
        verified: true,
        profile_picture: picture
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating Google user:', error);
      return res.status(500).json({ error: 'Failed to create user account' });
    }

    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        verified: newUser.verified
      }
    });
  } catch (error) {
    console.error('Google signup error:', error);
    res.status(500).json({ error: 'Google signup failed' });
  }
});

module.exports = router;