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
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    /\.ngrok-free\.app$/,
    "http://localhost:8080",
    "https://www.transcends-corp.tech",
    "https://transcends-corp.tech",
    "http://localhost:3000",
    "http://localhost:5173",
    "https://transcends-frontend.vercel.app"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 200
}));

app.use(morgan('dev'));

// Add debugging middleware for CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log('Request from origin:', origin);
  console.log('Request method:', req.method);
  next();
});

// Remove or comment out the local uploads static file serving since we're using Supabase
// app.use('/uploads', (req, res, next) => {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
//   next();
// }, express.static('uploads', {
//   setHeaders: (res, path) => {
//     if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png') || path.endsWith('.gif')) {
//       res.setHeader('Cache-Control', 'public, max-age=31536000');
//     }
//   }
// }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure express-fileupload
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 },
  createParentPath: true,
  useTempFiles: false,
  tempFileDir: '/tmp/',
  debug: false,
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

// Health check route
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Transcends Corp API</title>
      </head>
      <body>
        <h1>Hello from Transcends Corp API</h1>
        <p>Server is running properly!</p>
      </body>
    </html>
  `);
});

// Keep-alive ping functionality
const backendUrls = [
  'https://google.com'
];

function pingBackends() {
  backendUrls.forEach((url) => {
    https.get(url, (res) => {
      console.log(`Pinged ${url}: Status Code ${res.statusCode}`);
    }).on('error', (err) => {
      console.error(`Error pinging ${url}: ${err.message}`);
    });
  });
}

// Schedule pings every 10 minutes
setInterval(pingBackends, 600000);
pingBackends();

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with WebSocket support`);
});
