require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fileUpload = require('express-fileupload');
const http = require('http');
const https = require('https');
const { initializeSupabase } = require('./config/supabase');
const { initializeWebSocket } = require('./utils/websocket');

// Initialize Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize Supabase
initializeSupabase();
initializeWebSocket(server);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow cross-origin resource sharing
}));
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL,
      /\.ngrok-free\.app$/,
      "http://localhost:8080",
      "https://www.transcends-corp.tech/",
    ],
    credentials: true,
  })
);
app.use(morgan('dev'));

// Serve static files for uploads with proper headers
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
}, express.static('uploads', {
  setHeaders: (res, path) => {
    // Set cache headers for images
    if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png') || path.endsWith('.gif')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
    }
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure express-fileupload with proper settings
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max file size
  createParentPath: true,
  useTempFiles: false, // Use memory instead of temp files
  tempFileDir: '/tmp/',
  debug: false, // Set to true for debugging
  parseNested: true,
  preserveExtension: true,
  safeFileNames: true,
  defCharset: 'utf8',
  defParamCharset: 'utf8'
}));

// Routes - Order matters!
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/profile', require('./routes/profileRoutes'));
app.use('/api/campaigns', require('./routes/campaignRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/organizations', require('./routes/organizationRoutes'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Routes
app.get('/', (req, res) => {
  res.send(`
      <html>
          <head>
              <title>Transcends Corp API</title>
          </head>
          <body>
              <h1>Hello from Transcends Corp API</h1>
          </body>
      </html>
  `);
});

// List of backend URLs to ping
const backendUrls = [
  // 'https://677b-197-136-134-5.ngrok-free.app',
  'https://google.com'
]; // Add more URLs as needed

// Function to ping each backend URL
function pingBackends() {
  backendUrls.forEach((url) => {
    https.get(url, (res) => {
      console.log(`Pinged ${url}: Status Code ${res.statusCode}`);
    }).on('error', (err) => {
      console.error(`Error pinging ${url}: ${err.message}`);
    });
  });
}

// Schedule pings every 10 minutes (600,000 milliseconds)
setInterval(pingBackends, 600000);

// Ping immediately when the service starts
pingBackends();

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with WebSocket support`);
});
