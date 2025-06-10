const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken'); // Import the jsonwebtoken library

// Create a transporter object using your email service configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', // Replace with your SMTP server
  port: 587, // Replace with your SMTP port
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS, // Your email password
  },
});

const generateOTP = () => {
  return Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 10).toString()
  ).join(''); // Generates a 6 digit numeric OTP
};

const sendOTP = async (email, otp, isLoginVerification = false) => {
  try {
    console.log('Sending OTP email to:', email);
    
    const subject = isLoginVerification ? 'Login Verification - Transcends Corp' : 'Email Verification - Transcends Corp';
    const title = isLoginVerification ? 'Login Verification Required' : 'Email Verification Required';
    const message = isLoginVerification 
      ? 'We detected a login attempt from an unverified account. Please verify your account to complete the login process:'
      : 'Thank you for registering with Transcends Corp! To complete your account setup, please verify your email address using the verification code below:';

    const htmlContent = `
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title></title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #333;
      background-color: #fff;
    }

    .container {
      margin: 0 auto;
      width: 100%;
      max-width: 600px;
      padding: 0 0px;
      padding-bottom: 10px;
      border-radius: 5px;
      line-height: 1.8;
    }

    .header {
      border-bottom: 1px solid #eee;
    }

    .header a {
      font-size: 1.4em;
      color: #000;
      text-decoration: none;
      font-weight: 600;
    }

    .otp {
      background: linear-gradient(to right, #00bc69 0, #00bc88 50%, #00bca8 100%);
      margin: 0 auto;
      width: max-content;
      padding: 0 10px;
      color: #fff;
      border-radius: 4px;
    }

    .email-info {
      color: #666666;
      font-weight: 400;
      font-size: 13px;
      line-height: 18px;
      padding-bottom: 6px;
    }

    .email-info a {
      text-decoration: none;
      color: #00bc69;
    }
  </style>
</head>

<body>
  <div class="container">
    <div class="header">
      <a>${title}</a>
    </div>
    <br />
    <p>
      ${message}
      <br />
      <b>Your Verification Code is:</b>
    </p>
    <h2 class="otp">${otp}</h2>
    <p style="font-size: 0.9em">
      <br />
      <br />
      This verification code will expire in 10 minutes. ${isLoginVerification ? 'Once verified, you will be automatically logged in.' : 'Once verified, you can login to your account.'}
      <br />
      <strong>Do not forward or give this code to anyone.</strong>
      <br />
      <br />
      <strong>${isLoginVerification ? 'Thank you for using' : 'Welcome to'} Transcends Corp!</strong>
      <br />
      <br />
      Best regards,
      <br />
      <strong>Transcends Corp Team</strong>
    </p>

    <hr style="border: none; border-top: 0.5px solid #131111" />
  </div>
  <div style="text-align: center">
    <div class="email-info">
      <span>
        This email was sent to
        <a href="mailto:${email}">${email}</a>
      </span>
    </div>
    
    <div class="email-info">
      &copy; ${new Date().getFullYear()} Transcends Corp. All rights reserved.
    </div>
  </div>
</body>
</html>
    `;

    const result = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject,
      html: htmlContent,
    });

    console.log('OTP email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw error;
  }
};

const storedOTPs = {};

const checkOTP = async (email, otp) => {
  if (storedOTPs[email] === otp) {
    delete storedOTPs[email];
    return true;
  }
  return false;
};

const storeOTP = async (email, otp) => {
  storedOTPs[email] = otp;
};
// Function to send an email
const sendEmail = async (to, resetLink) => {
 const htmlContent = `
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title></title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #333;
      background-color: #fff;
    }

    .container {
      margin: 0 auto;
      width: 100%;
      max-width: 600px;
      padding: 0 0px;
      padding-bottom: 10px;
      border-radius: 5px;
      line-height: 1.8;
    }

    .header {
      border-bottom: 1px solid #eee;
    }

    .header a {
      font-size: 1.4em;
      color: #000;
      text-decoration: none;
      font-weight: 600;
    }

    .content {
      min-width: 700px;
      overflow: auto;
      line-height: 2;
    }

    .otp {
      background: linear-gradient(to right, #00bc69 0, #00bc88 50%, #00bca8 100%);
      margin: 0 auto;
      width: max-content;
      padding: 0 10px;
      color: #fff;
      border-radius: 4px;
    }

    .footer {
      color: #aaa;
      font-size: 0.8em;
      line-height: 1;
      font-weight: 300;
    }

    .email-info {
      color: #666666;
      font-weight: 400;
      font-size: 13px;
      line-height: 18px;
      padding-bottom: 6px;
    }

    .email-info a {
      text-decoration: none;
      color: #00bc69;
    }
  </style>
</head>

<body>
  <div class="container">
    <div class="header">
      <a>Your Password Reset Request</a>
    </div>
    <br />
    <p>
      We have received a password reset request for your account. 
      <br />
    </p>
    <a href="${resetLink}"><h2 class="otp">RESET PASSWORD></h2></a
    <p style="font-size: 0.9em">
      <br />
      <br />
      If you did not initiate this login request, please disregard this
      message. Please ensure the confidentiality of your login credentials and do not share
      it with anyone.<br />
      <strong>Do not forward or give this email to anyone.</strong>
      <br />
      <br />
      <strong>Thank you for using Trancends Corp.</strong>
      <br />
      <br />
      Best regards,
      <br />
      <strong>Trancends Corp</strong>
    </p>

    <hr style="border: none; border-top: 0.5px solid #131111" />
  </div>
  <div style="text-align: center">
    <div class="email-info">
      <span>
        This email was sent to
        <a href="mailto:${to}">${to}</a>
      </span>
    </div>
    
    <div class="email-info">
      &copy; <script>document.write(new Date().getFullYear())</script> Transcends Corp. All rights
      reserved.
    </div>
  </div>
</body>
</html>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_USER, // Sender address
    to: to, // Recipient's email
    subject: 'Password Reset Request',
    html: htmlContent, // Use the HTML content
  });
};

const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Use your JWT secret
    return decoded; // Return the decoded payload
  } catch (error) {
   console.error('Token verification error:', error);
  return null; // Return null if token is invalid or expired
  }
};

// Enhanced function to send organization approval/rejection notification
const sendOrganizationStatusEmail = async (email, organizationName, status, notes = '') => {
  try {
    console.log('Sending organization status email to:', email);
    
    const isApproved = status === 'approved';
    const subject = isApproved 
      ? '🎉 Organization Approved - Welcome to Transcends Corp!' 
      : '📋 Organization Application Update - Action Required';
    
    const title = isApproved 
      ? 'Congratulations! Your Organization is Approved' 
      : 'Organization Application Status Update';
    
    const mainMessage = isApproved 
      ? `Excellent news! Your organization "${organizationName}" has been successfully approved and verified on our platform. You're now ready to start creating impactful crowdfunding campaigns and connecting with supporters who believe in your cause.`
      : `Thank you for your interest in joining Transcends Corp. After reviewing your organization application for "${organizationName}", we need some additional information or updates before we can proceed with approval.`;

    const htmlContent = `
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title></title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #333;
      background-color: #fff;
      line-height: 1.6;
    }

    .container {
      margin: 0 auto;
      width: 100%;
      max-width: 600px;
      padding: 0 20px;
      padding-bottom: 20px;
      border-radius: 5px;
    }

    .header {
      background: ${isApproved ? 'linear-gradient(135deg, #00bc69 0%, #00bca8 100%)' : 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)'};
      color: white;
      padding: 30px 20px;
      text-align: center;
      border-radius: 8px 8px 0 0;
    }

    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: bold;
    }

    .header p {
      margin: 8px 0 0 0;
      font-size: 16px;
      opacity: 0.9;
    }

    .content {
      background: white;
      padding: 30px 20px;
      border: 1px solid #e5e7eb;
      border-top: none;
    }

    .status-badge {
      background: ${isApproved ? 'linear-gradient(to right, #00bc69 0, #00bc88 50%, #00bca8 100%)' : 'linear-gradient(to right, #f59e0b 0, #f97316 50%, #ea580c 100%)'};
      margin: 20px auto;
      width: max-content;
      padding: 12px 24px;
      color: #fff;
      border-radius: 25px;
      font-weight: bold;
      text-align: center;
      font-size: 14px;
      letter-spacing: 0.5px;
    }

    .content-box {
      background-color: ${isApproved ? '#f0fdf4' : '#fef3c7'};
      border: 1px solid ${isApproved ? '#bbf7d0' : '#fde68a'};
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }

    .action-button {
      background: linear-gradient(to right, #00bc69 0, #00bc88 50%, #00bca8 100%);
      color: white;
      padding: 14px 28px;
      text-decoration: none;
      border-radius: 6px;
      display: inline-block;
      font-weight: bold;
      margin: 20px 0;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0, 188, 105, 0.2);
    }

    .next-steps {
      background-color: #f8fafc;
      border-left: 4px solid ${isApproved ? '#00bc69' : '#f59e0b'};
      padding: 20px;
      margin: 25px 0;
      border-radius: 0 8px 8px 0;
    }

    .feature-list {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }

    .feature-list ul {
      margin: 0;
      padding-left: 20px;
    }

    .feature-list li {
      margin-bottom: 8px;
      color: #374151;
    }

    .footer {
      background-color: #f9fafb;
      padding: 20px;
      border-radius: 0 0 8px 8px;
      border: 1px solid #e5e7eb;
      border-top: none;
      text-align: center;
    }

    .email-info {
      color: #666666;
      font-weight: 400;
      font-size: 13px;
      line-height: 18px;
      padding-bottom: 6px;
    }

    .email-info a {
      text-decoration: none;
      color: #00bc69;
    }
  </style>
</head>

<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
      <p>${organizationName}</p>
    </div>

    <div class="content">
      <div class="status-badge">
        ${isApproved ? '✅ ORGANIZATION APPROVED' : '⚠️ ACTION REQUIRED'}
      </div>

      <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>
      
      <p style="font-size: 16px; margin-bottom: 25px;">${mainMessage}</p>

      ${isApproved ? `
        <div class="content-box">
          <h3 style="color: #059669; margin-top: 0; margin-bottom: 15px;">🚀 What You Can Do Now:</h3>
          <div class="feature-list">
            <ul>
              <li><strong>Create Campaigns:</strong> Launch fundraising campaigns for your causes and projects</li>
              <li><strong>Build Community:</strong> Connect with supporters who share your mission and values</li>
              <li><strong>Track Impact:</strong> Monitor your fundraising progress and community engagement in real-time</li>
              <li><strong>Access Tools:</strong> Use our comprehensive campaign management and analytics tools</li>
              <li><strong>Get Support:</strong> Access our dedicated support team and resources for organizations</li>
            </ul>
          </div>
        </div>

        <div class="next-steps">
          <h4 style="color: #00bc69; margin-top: 0; margin-bottom: 15px;">🎯 Ready to Make an Impact?</h4>
          <p style="margin-bottom: 20px;">
            Your organization dashboard is now fully activated! Log in to start creating your first campaign. 
            Our platform provides everything you need to successfully raise funds and build a community around your cause.
          </p>
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/organization-dashboard" class="action-button">
              🏢 Access Your Organization Dashboard
            </a>
          </div>
        </div>

        <div class="feature-list">
          <h4 style="margin-top: 0; margin-bottom: 15px;">💡 Pro Tips for Success:</h4>
          <ul>
            <li>Use compelling storytelling with images and videos in your campaigns</li>
            <li>Set realistic but ambitious funding goals</li>
            <li>Keep your supporters updated with regular campaign updates</li>
            <li>Engage with your community through comments and messages</li>
            <li>Share your campaigns on social media and with your networks</li>
          </ul>
        </div>
      ` : `
        <div class="next-steps">
          <h4 style="color: #f59e0b; margin-top: 0; margin-bottom: 15px;">🔄 Next Steps to Get Approved:</h4>
          <div class="feature-list">
            <ul>
              <li>Review the specific feedback provided below carefully</li>
              <li>Update your organization information as needed</li>
              <li>Upload any required documentation (registration certificates, etc.)</li>
              <li>Ensure all information is accurate, complete, and up-to-date</li>
              <li>Double-check that your organization description clearly explains your mission</li>
            </ul>
          </div>
          <p style="margin-top: 20px;">
            Once you've made the necessary updates, our team will automatically review your application again. 
            Most re-reviews are completed within 24-48 hours.
          </p>
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/organization-dashboard" class="action-button">
              📝 Update Your Application
            </a>
          </div>
        </div>
      `}

      ${notes ? `
        <div class="content-box">
          <h4 style="margin-top: 0; margin-bottom: 15px;">💬 ${isApproved ? 'Notes' : 'Feedback'} from Our Team:</h4>
          <div style="background-color: white; padding: 15px; border-radius: 6px; border: 1px solid ${isApproved ? '#bbf7d0' : '#fde68a'};">
            <p style="margin: 0; color: #374151;">
              ${notes}
            </p>
          </div>
        </div>
      ` : ''}

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 15px;">
          ${isApproved ? 
            'We\'re excited to have you as part of the Transcends Corp community! If you have any questions about using our platform or need assistance with your first campaign, our support team is here to help.' :
            'We appreciate your interest in joining Transcends Corp. If you have any questions about the approval process or need clarification on the feedback, please don\'t hesitate to reach out to our support team.'
          }
        </p>
      </div>
    </div>

    <div class="footer">
      <p style="margin: 0 0 10px 0; font-weight: bold; color: #00bc69;">
        Thank you for choosing Transcends Corp!
      </p>
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        Together, we're building stronger communities through the power of crowdfunding.
      </p>
    </div>

    <div style="text-align: center; padding: 20px 0;">
      <div class="email-info">
        <span>
          This email was sent to
          <a href="mailto:${email}">${email}</a>
        </span>
      </div>
      
      <div class="email-info">
        Questions? Contact us at <a href="mailto:support@transcends.com">support@transcends.com</a>
      </div>
      
      <div class="email-info">
        &copy; ${new Date().getFullYear()} Transcends Corp. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const result = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject,
      html: htmlContent,
    });

    console.log('Organization status email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending organization status email:', error);
    throw error;
  }
};

// Add Google OAuth verification function
const verifyGoogleToken = async (token) => {
  try {
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    return {
      email: payload.email,
      name: payload.name,
      googleId: payload.sub,
      emailVerified: payload.email_verified,
      picture: payload.picture
    };
  } catch (error) {
    console.error('Google token verification failed:', error);
    return null;
  }
};

// Add Firebase ID token verification
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Initialize Firebase Admin (add this only if not already initialized)
let adminAuth;
try {
  // You can either use service account key or default credentials
  adminAuth = getAuth();
} catch (error) {
  console.log('Firebase Admin not initialized, using Google Client ID verification instead');
}

// Verify Firebase ID token
const verifyFirebaseToken = async (idToken) => {
  try {
    if (!adminAuth) {
      // Fallback: Basic token validation using Google's public keys
      // This is a simplified approach - in production, use Firebase Admin SDK
      const { OAuth2Client } = require('google-auth-library');
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      
      const ticket = await client.verifyIdToken({
        idToken: idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      
      const payload = ticket.getPayload();
      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        emailVerified: payload.email_verified
      };
    }
    
    // Use Firebase Admin SDK
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    return {
      googleId: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
      emailVerified: decodedToken.email_verified
    };
  } catch (error) {
    console.error('Firebase token verification error:', error);
    return null;
  }
};

module.exports = { 
  generateOTP, 
  sendOTP, 
  sendEmail, 
  checkOTP, 
  storeOTP, 
  verifyToken, 
  sendOrganizationStatusEmail,
  verifyGoogleToken, // Add this export
  verifyFirebaseToken
};
