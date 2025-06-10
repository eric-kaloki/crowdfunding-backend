const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');

const generateToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const authenticate = async (req, res, next) => {
  try {
    console.log('Authentication middleware executed');
    
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No token provided');
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token decoded:', { userId: decoded.userId, role: decoded.role });

      // Get user from database using profiles table
      const { data: user, error } = await supabase
        .from('profiles')
        .select('id, email, name, role, verification_status')
        .eq('id', decoded.userId)
        .single();

      if (error || !user) {
        console.log('User not found in database:', error);
        return res.status(401).json({ error: 'Invalid token - user not found' });
      }

      if (user.verification_status !== 'verified') {
        console.log('User not verified:', user.email);
        return res.status(401).json({ error: 'Account not verified' });
      }

      console.log('User authenticated successfully:', user.email);

      // Split name for response
      const [firstName, ...lastName] = user.name.split(' ');
      user.firstName = firstName;
      user.lastName = lastName.join(' ');

      // Check if token is about to expire (less than 1 hour remaining)
      const tokenExp = decoded.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      if (tokenExp - now < oneHour) {
        // Generate new token
        const newToken = generateToken(user.id, user.role);
        res.setHeader('x-new-token', newToken);
        console.log('New token generated for user:', user.email);
      }

      // Attach user to request
      req.user = user;
      next();
    } catch (error) {
      console.log('Token verification error:', error);
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const isAdmin = (req, res, next) => {
  console.log('Admin middleware executed');
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = {
  authenticate,
  isAdmin,
  requireAdmin,
  requireRole,
  generateToken
};
