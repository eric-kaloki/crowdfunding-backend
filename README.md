# Transcends Corp - Crowdfunding Platform Backend

## Overview

The Transcends Corp backend is a robust Node.js/Express API server that powers a comprehensive crowdfunding platform. Built with modern technologies and security best practices, it provides authentication, campaign management, payment processing through M-Pesa, real-time features via WebSocket, and comprehensive admin tools for platform management.

## 🚀 Core Features

### Authentication & Security
- **Multi-Role Authentication**: Support for users, organizations, and administrators
- **JWT Token Management**: Secure token-based authentication with automatic refresh
- **Email Verification**: OTP-based email verification system with HTML templates
- **Password Security**: Bcrypt hashing with salt rounds for password protection
- **Google OAuth Integration**: Seamless Google authentication for user convenience
- **Role-Based Access Control**: Granular permissions based on user roles

### User Management
- **Profile Management**: Comprehensive user profiles with image upload
- **Organization Registration**: Multi-step organization verification process
- **Account Verification**: Email-based account activation system
- **Password Recovery**: Secure password reset with JWT-based tokens

### Campaign Management
- **Campaign CRUD Operations**: Complete campaign lifecycle management
- **Category-based Organization**: Structured campaign categorization
- **Approval Workflow**: Admin review and approval process for campaigns
- **File Upload Support**: Image and document upload for campaigns
- **Real-time Updates**: WebSocket integration for live campaign updates

### Payment Processing
- **M-Pesa Integration**: Full M-Pesa STK Push and callback handling
- **Transaction Management**: Comprehensive payment tracking and reconciliation
- **Contribution Tracking**: Detailed contribution history and analytics
- **Payment Verification**: Secure payment verification and status updates
- **Refund Management**: Admin-controlled refund processing

### Admin & Analytics
- **Comprehensive Dashboard**: Platform-wide statistics and insights
- **User Management**: Admin tools for user account management
- **Organization Approval**: Review and approve organization registrations
- **Campaign Oversight**: Monitor and manage all platform campaigns
- **Payment Analytics**: Detailed financial reporting and analytics
- **Activity Logging**: Comprehensive audit trails for admin actions

### Real-time Features
- **WebSocket Integration**: Real-time updates for campaigns and notifications
- **Live Campaign Updates**: Instant funding progress updates
- **Real-time Comments**: Live commenting system for campaigns
- **Notification System**: Instant notifications for platform activities

## 🛠 Technical Architecture

### Backend Technologies
- **Runtime**: Node.js 18+ with Express.js framework
- **Database**: Supabase (PostgreSQL) for data persistence
- **Authentication**: JWT tokens with bcrypt password hashing
- **File Storage**: Local file system with planned cloud storage migration
- **Real-time**: WebSocket for live updates
- **Email Service**: Nodemailer with Gmail SMTP
- **Payment Gateway**: M-Pesa Daraja API integration

### Key Dependencies
```json
{
  "express": "^4.18.0",
  "bcryptjs": "^2.4.3",
  "jsonwebtoken": "^9.0.0",
  "@supabase/supabase-js": "^2.38.0",
  "nodemailer": "^6.9.0",
  "express-fileupload": "^1.4.0",
  "ws": "^8.14.0",
  "cors": "^2.8.5",
  "helmet": "^7.0.0",
  "morgan": "^1.10.0"
}
```

## 📁 Project Structure

```
backend/
├── config/              # Configuration files
│   ├── supabase.js      # Database connection setup
│   └── mpesa.js         # M-Pesa API configuration
├── routes/              # API route definitions
│   ├── authRoutes.js    # Authentication endpoints
│   ├── campaignRoutes.js # Campaign management
│   ├── adminRoutes.js   # Admin-specific endpoints
│   ├── paymentRoutes.js # Payment processing
│   ├── profileRoutes.js # User profile management
│   └── organizationRoutes.js # Organization management
├── middleware/          # Express middleware
│   └── auth.js          # Authentication middleware
├── utils/               # Utility functions
│   ├── otpUtils.js      # OTP generation and email sending
│   └── websocket.js     # WebSocket server setup
├── uploads/             # File upload storage
│   └── profiles/        # Profile picture storage
├── server.js            # Main server entry point
└── .env                 # Environment configuration
```

## 🔧 Setup & Installation

### Prerequisites
- Node.js 18+ and npm
- Supabase account and project
- Gmail account for email services
- M-Pesa Daraja API credentials (for payments)

### Installation Steps

1. **Clone the repository**
```bash
git clone https://github.com/your-org/transcends-backend.git
cd transcends-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment Configuration**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Database Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key

# Email Configuration
EMAIL_USER=your_gmail_address
EMAIL_PASS=your_gmail_app_password

# Frontend Configuration
FRONTEND_URL=http://localhost:8080

# M-Pesa Configuration
MPESA_CONSUMER_KEY=your_mpesa_consumer_key
MPESA_CONSUMER_SECRET=your_mpesa_consumer_secret
MPESA_PASSKEY=your_mpesa_passkey
MPESA_SHORTCODE=your_business_shortcode
MPESA_CALLBACK_URL=your_callback_url

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Server Configuration
PORT=5000
NODE_ENV=development
```

4. **Database Setup**
Run the database migrations in Supabase:
```sql
-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  phone TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'organization', 'admin')),
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified')),
  profile_picture TEXT,
  bio TEXT,
  location TEXT,
  google_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL,
  organization_description TEXT NOT NULL,
  organization_registration_number TEXT,
  contact_person TEXT NOT NULL,
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  registration_certificate_url TEXT,
  approval_notes TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create campaigns table
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  funding_goal NUMERIC(12,2) NOT NULL,
  current_funding NUMERIC(12,2) DEFAULT 0,
  category TEXT NOT NULL,
  status TEXT DEFAULT 'pending_approval' CHECK (status IN ('draft', 'pending_approval', 'active', 'funded', 'closed', 'cancelled')),
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  image_url TEXT,
  featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create contributions table
CREATE TABLE contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contributor_id UUID REFERENCES profiles(id),
  amount NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_method TEXT DEFAULT 'mpesa',
  mpesa_transaction_id TEXT,
  mpesa_phone_number TEXT,
  mpesa_checkout_request_id TEXT,
  result_code TEXT,
  result_desc TEXT,
  anonymous BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

5. **Start the server**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will be available at `https://crowdfunding-backend-r9z5.onrender.com/api`

## 🔌 API Documentation

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "phone": "+254700000000",
  "role": "user"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

#### Verify OTP
```http
POST /api/auth/verify-otp
Content-Type: application/json

{
  "email": "john@example.com",
  "otp": "123456"
}
```

#### Google Authentication
```http
POST /api/auth/google-auth
Content-Type: application/json

{
  "accessToken": "google_access_token",
  "userInfo": {
    "email": "john@gmail.com",
    "name": "John Doe",
    "picture": "profile_picture_url"
  },
  "mode": "signin"
}
```

### Campaign Management

#### Create Campaign
```http
POST /api/campaigns
Authorization: Bearer jwt_token
Content-Type: multipart/form-data

{
  "title": "Help Build a School",
  "description": "Campaign description...",
  "funding_goal": 100000,
  "end_date": "2024-12-31",
  "category": "Education",
  "campaign_image": file
}
```

#### Get Public Campaigns
```http
GET /api/campaigns/public?page=1&limit=10&category=Education
```

#### Get Campaign Details
```http
GET /api/campaigns/:campaignId
Authorization: Bearer jwt_token
```

#### Contribute to Campaign
```http
POST /api/campaigns/:campaignId/contribute
Authorization: Bearer jwt_token
Content-Type: application/json

{
  "amount": 1000,
  "phoneNumber": "254700000000",
  "anonymous": false,
  "notes": "Great cause!"
}
```

### User Profile Management

#### Get Own Profile
```http
GET /api/auth/profile/me
Authorization: Bearer jwt_token
```

#### Update Profile
```http
PATCH /api/auth/profile/me
Authorization: Bearer jwt_token
Content-Type: application/json

{
  "name": "Updated Name",
  "bio": "Updated bio",
  "location": "Nairobi, Kenya"
}
```

#### Upload Profile Picture
```http
POST /api/profile/upload-picture
Authorization: Bearer jwt_token
Content-Type: multipart/form-data

{
  "profilePicture": file
}
```

### Organization Management

#### Get Organization Profile
```http
GET /api/organizations/profile
Authorization: Bearer jwt_token
```

#### Upload Registration Certificate
```http
POST /api/organizations/upload-certificate
Authorization: Bearer jwt_token
Content-Type: multipart/form-data

{
  "certificate": file
}
```

### Admin Endpoints

#### Get Platform Statistics
```http
GET /api/admin/stats
Authorization: Bearer admin_jwt_token
```

#### Get All Campaigns (Admin)
```http
GET /api/admin/campaigns
Authorization: Bearer admin_jwt_token
```

#### Update Campaign Status
```http
PATCH /api/admin/campaigns/:campaignId/status
Authorization: Bearer admin_jwt_token
Content-Type: application/json

{
  "status": "active",
  "admin_notes": "Campaign approved after review"
}
```

#### Get Organizations for Review
```http
GET /api/admin/organizations
Authorization: Bearer admin_jwt_token
```

#### Approve/Reject Organization
```http
PATCH /api/admin/organizations/:orgId/approval
Authorization: Bearer admin_jwt_token
Content-Type: application/json

{
  "approval_status": "approved",
  "approval_notes": "All documents verified"
}
```

### Payment Processing

#### Initiate M-Pesa Payment
```http
POST /api/payments/initiate
Authorization: Bearer jwt_token
Content-Type: application/json

{
  "phoneNumber": "254700000000",
  "amount": 1000,
  "campaignId": "campaign_uuid"
}
```

#### M-Pesa Callback (Internal)
```http
POST /api/payments/mpesa/callback/contributions
Content-Type: application/json

{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "merchant_id",
      "CheckoutRequestID": "checkout_id",
      "ResultCode": 0,
      "ResultDesc": "Success",
      "CallbackMetadata": {
        "Item": [
          {
            "Name": "MpesaReceiptNumber",
            "Value": "receipt_number"
          }
        ]
      }
    }
  }
}
```

## 🔐 Security Features

### Authentication Security
- **JWT Tokens**: Secure token-based authentication with configurable expiration
- **Password Hashing**: Bcrypt with salt rounds for secure password storage
- **Role-Based Access**: Granular permissions based on user roles
- **Token Refresh**: Automatic token refresh for seamless user experience

### API Security
- **CORS Protection**: Configurable CORS settings for cross-origin requests
- **Helmet Security**: Security headers for protection against common attacks
- **Input Validation**: Server-side validation for all API inputs
- **Rate Limiting**: Protection against abuse and DDoS attacks
- **File Upload Security**: Secure file upload with type and size validation

### Data Security
- **SQL Injection Protection**: Parameterized queries through Supabase
- **XSS Prevention**: Input sanitization and output encoding
- **Data Encryption**: Sensitive data encryption at rest and in transit
- **Audit Logging**: Comprehensive logging for security monitoring

## 💰 M-Pesa Integration

### Payment Flow
1. **Initiate Payment**: User initiates payment through frontend
2. **STK Push**: Server sends STK push to user's phone
3. **User Confirmation**: User enters M-Pesa PIN on phone
4. **Callback Processing**: M-Pesa sends callback to server
5. **Status Update**: Payment status updated in database
6. **Notification**: User receives real-time payment confirmation

### M-Pesa Configuration
```javascript
// M-Pesa API Configuration
const mpesaConfig = {
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  passkey: process.env.MPESA_PASSKEY,
  shortcode: process.env.MPESA_SHORTCODE,
  callbackUrl: process.env.MPESA_CALLBACK_URL,
  environment: 'sandbox' // or 'production'
};
```

### Callback Handling
```javascript
// M-Pesa callback processing
router.post('/mpesa/callback/contributions', async (req, res) => {
  const { Body: { stkCallback } } = req.body;
  const { ResultCode, ResultDesc, CallbackMetadata } = stkCallback;
  
  // Extract transaction details
  const transactionId = extractTransactionId(CallbackMetadata);
  
  // Update payment status
  await updatePaymentStatus(transactionId, ResultCode, ResultDesc);
  
  // Send real-time notification
  broadcastPaymentUpdate(transactionId, status);
  
  res.status(200).json({ message: 'Callback processed' });
});
```

## 📧 Email System

### Email Templates
The system includes professional HTML email templates for:
- **Account Verification**: Welcome email with OTP verification
- **Password Reset**: Secure password reset instructions
- **Organization Approval**: Notification for organization status changes
- **Campaign Updates**: Updates on campaign activities

### Email Configuration
```javascript
// Nodemailer configuration
const transporter = nodemailer.createTransporter({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
```

## 🌐 WebSocket Integration

### Real-time Features
- **Campaign Updates**: Live funding progress updates
- **Comment System**: Real-time commenting on campaigns
- **Notification System**: Instant notifications for user activities
- **Admin Updates**: Live updates for admin operations

### WebSocket Implementation
```javascript
// WebSocket server setup
const wss = new WebSocket.Server({ server });

// Campaign subscription management
const subscribeToCampaign = (ws, campaignId) => {
  campaignSubscriptions.set(campaignId, ws);
  ws.send(JSON.stringify({
    type: 'subscription_confirmed',
    campaignId
  }));
};

// Broadcast updates to subscribers
const broadcastCampaignUpdate = (campaignId, updateData) => {
  const subscribers = campaignSubscriptions.get(campaignId);
  if (subscribers) {
    subscribers.forEach(ws => {
      ws.send(JSON.stringify({
        type: 'campaign_update',
        campaignId,
        data: updateData
      }));
    });
  }
};
```

## 📊 Database Schema

### Key Tables

#### Profiles Table
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  phone TEXT,
  role TEXT DEFAULT 'user',
  verification_status TEXT DEFAULT 'pending',
  profile_picture TEXT,
  bio TEXT,
  location TEXT,
  google_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Campaigns Table
```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  funding_goal NUMERIC(12,2) NOT NULL,
  current_funding NUMERIC(12,2) DEFAULT 0,
  category TEXT NOT NULL,
  status TEXT DEFAULT 'pending_approval',
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  image_url TEXT,
  featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Contributions Table
```sql
CREATE TABLE contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  contributor_id UUID REFERENCES profiles(id),
  amount NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_method TEXT DEFAULT 'mpesa',
  mpesa_transaction_id TEXT,
  mpesa_phone_number TEXT,
  anonymous BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🔍 Monitoring & Logging

### Logging System
- **Morgan HTTP Logging**: Detailed HTTP request logging
- **Custom Application Logging**: Application-specific event logging
- **Error Tracking**: Comprehensive error logging and tracking
- **Performance Monitoring**: Response time and performance metrics

### Health Monitoring
```javascript
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});
```

## 🚀 Deployment

### Production Setup

#### Environment Variables for Production
```env
NODE_ENV=production
PORT=5000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_production_supabase_key
JWT_SECRET=your_super_secure_production_jwt_secret
FRONTEND_URL=https://your-frontend-domain.com
MPESA_CALLBACK_URL=https://your-backend-domain.com/api/payments
```

#### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

#### Docker Compose
```yaml
version: '3.8'
services:
  transcends-backend:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
    restart: unless-stopped
```

### Deployment Platforms
- **Railway**: Recommended for easy deployment with database integration
- **Heroku**: Traditional PaaS with addon ecosystem
- **AWS ECS**: Container-based deployment for scalability
- **DigitalOcean App Platform**: Simple container deployment
- **VPS Deployment**: Manual deployment on virtual private servers

## 🧪 Testing

### Testing Strategy
```javascript
// Unit tests for authentication
describe('Authentication', () => {
  test('should register new user', async () => {
    const userData = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123'
    };
    
    const response = await request(app)
      .post('/api/auth/register')
      .send(userData)
      .expect(201);
      
    expect(response.body.message).toContain('created successfully');
  });
});

// Integration tests for campaigns
describe('Campaigns', () => {
  test('should create campaign with valid token', async () => {
    const token = generateTestToken();
    const campaignData = {
      title: 'Test Campaign',
      description: 'Test description',
      funding_goal: 10000,
      category: 'Education',
      end_date: '2024-12-31'
    };
    
    const response = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send(campaignData)
      .expect(201);
  });
});
```

### Test Commands
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run specific test file
npm test auth.test.js
```

## 🔧 Performance Optimization

### Database Optimization
- **Indexed Queries**: Strategic database indexing for performance
- **Connection Pooling**: Efficient database connection management
- **Query Optimization**: Optimized SQL queries with proper joins
- **Caching Strategy**: Redis caching for frequently accessed data

### API Performance
- **Response Compression**: Gzip compression for API responses
- **Rate Limiting**: Protection against API abuse
- **Pagination**: Efficient data pagination for large datasets
- **Lazy Loading**: On-demand data loading for better performance

## 🐛 Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check Supabase connection
curl -H "apikey: YOUR_SUPABASE_KEY" \
     "https://YOUR_PROJECT.supabase.co/rest/v1/profiles?select=*&limit=1"

# Verify environment variables
node -e "console.log(process.env.SUPABASE_URL)"
```

#### M-Pesa Integration Issues
```bash
# Test M-Pesa credentials
curl -X POST \
  https://sandbox.safaricom.co.ke/oauth/v1/generate \
  -H "Authorization: Basic $(echo -n 'CONSUMER_KEY:CONSUMER_SECRET' | base64)"

# Check callback URL accessibility
curl -X POST YOUR_CALLBACK_URL/test-callback \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

#### Email Service Issues
```bash
# Test email configuration
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});
transporter.verify().then(console.log).catch(console.error);
"
```

#### File Upload Issues
```bash
# Check upload directory permissions
ls -la uploads/
chmod 755 uploads/
chmod 755 uploads/profiles/

# Verify disk space
df -h
```

### Error Handling
```javascript
// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // Log error details
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // Send appropriate response
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});
```

## 📈 Scaling Considerations

### Horizontal Scaling
- **Load Balancing**: Multiple server instances behind load balancer
- **Database Clustering**: Read replicas for improved performance
- **Microservices**: Service decomposition for better scalability
- **Container Orchestration**: Kubernetes for container management

### Vertical Scaling
- **Resource Optimization**: CPU and memory optimization
- **Database Performance**: Query optimization and indexing
- **Caching Layers**: Redis for session and data caching
- **CDN Integration**: Content delivery network for static assets

## 📞 Support & Maintenance

### Monitoring & Alerting
- **Application Monitoring**: Real-time application performance monitoring
- **Error Tracking**: Automated error detection and alerting
- **Performance Metrics**: Database and API performance tracking
- **Uptime Monitoring**: Continuous availability monitoring

### Backup & Recovery
- **Database Backups**: Automated daily database backups
- **File Storage Backups**: Regular backup of uploaded files
- **Disaster Recovery**: Recovery procedures for system failures
- **Data Migration**: Tools for data migration and updates

## 📄 API Rate Limiting

### Rate Limiting Configuration
```javascript
const rateLimit = require('express-rate-limit');

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

// Authentication rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // limit each IP to 5 requests per windowMs
  skipSuccessfulRequests: true
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
```

## 🔗 External Integrations

### Supabase Integration
- **Authentication**: Supabase Auth for user management
- **Database**: PostgreSQL database with real-time subscriptions
- **Storage**: File storage for images and documents
- **Edge Functions**: Serverless functions for complex operations

### Third-party Services
- **M-Pesa Daraja API**: Mobile payment processing
- **Gmail SMTP**: Email service for notifications
- **Google OAuth**: Social authentication
- **Cloudinary** (planned): Advanced image management
- **SendGrid** (planned): Advanced email service

## 📞 Contact & Support

- **Development Team**: transcends.corp@gmail.com
- **Documentation**: [GitHub Wiki](https://github.com/your-org/transcends-backend/wiki)
- **Issues**: [GitHub Issues](https://github.com/your-org/transcends-backend/issues)
- **API Documentation**: [Postman Collection](link-to-postman)
- **Response Time**: 24-48 hours for support requests

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Last updated: January 2024*
*Version: 1.0.0*
*API Version: v1*