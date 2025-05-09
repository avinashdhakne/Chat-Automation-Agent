import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: true, // Reflect the request origin
  credentials: true, // Allow credentials
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests explicitly
app.options('*', cors());

app.use(express.json()); // Parse JSON request bodies

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.headers.origin || 'unknown'}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Proxy server is running' });
});

// Test endpoint for direct communication with Ollama
app.get('/test-ollama', async (req, res) => {
  try {
    console.log('Testing connection to Ollama');
    const response = await fetch('http://localhost:11434/api/version');
    const data = await response.json();
    res.json({ status: 'ok', message: 'Ollama is reachable', version: data.version });
  } catch (error) {
    console.error('Error connecting to Ollama:', error.message);
    res.status(500).json({ error: 'Failed to connect to Ollama', details: error.message });
  }
});

// Proxy route for chat API
app.post('/api/chat', async (req, res) => {
  try {
    console.log('Received chat request from origin:', req.headers.origin);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Validate required fields
    if (!req.body || !req.body.model || !req.body.messages) {
      console.error('Invalid request body:', req.body);
      return res.status(400).json({ 
        error: 'Invalid request. Required fields: model, messages', 
        receivedBody: req.body 
      });
    }

    try {
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Ollama API error (${response.status}):`, errorText);
        return res.status(response.status).json({ 
          error: `Ollama API returned error: ${response.status}`, 
          details: errorText 
        });
      }

      const responseText = await response.text();
      console.log('Raw Ollama response:', responseText);
      
      try {
        const data = JSON.parse(responseText);
        console.log('Successfully proxied Ollama chat response');
        return res.json(data);
      } catch (parseError) {
        console.error('Error parsing Ollama response as JSON:', parseError.message);
        return res.status(500).json({ 
          error: 'Invalid JSON response from Ollama', 
          rawResponse: responseText 
        });
      }
    } catch (fetchError) {
      console.error('Error fetching from Ollama:', fetchError.message);
      return res.status(502).json({ 
        error: 'Error connecting to Ollama API', 
        details: fetchError.message 
      });
    }
  } catch (error) {
    console.error('General error in proxy server:', error.message);
    res.status(500).json({ 
      error: 'An unexpected error occurred', 
      message: error.message
    });
  }
});

// Main proxy route to forward requests to the Ollama API for /api/generate endpoint
app.post('/api/generate', async (req, res) => {
  try {
    console.log('Received generate request from origin:', req.headers.origin);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Validate the request body
    if (!req.body || !req.body.model || !req.body.prompt) {
      console.error('Invalid request format:', req.body);
      return res.status(400).json({ 
        error: 'Invalid request format. Required: model (string) and prompt (string)',
        receivedBody: req.body
      });
    }
    
    try {
      // Forward the request to Ollama
      const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      });
      
      // Check for Ollama API errors
      if (!ollamaResponse.ok) {
        const errorBody = await ollamaResponse.text();
        console.error(`Ollama API error (${ollamaResponse.status}):`, errorBody);
        return res.status(502).json({ 
          error: `Ollama API returned error: ${ollamaResponse.status}`,
          details: errorBody
        });
      }
      
      // Get the response as text first to log it
      const responseText = await ollamaResponse.text();
      console.log('Raw Ollama response:', responseText);
      
      // Parse the response and send it back
      try {
        const data = JSON.parse(responseText);
        console.log('Successfully proxied Ollama response');
        return res.json(data);
      } catch (parseError) {
        console.error('Error parsing Ollama response as JSON:', parseError.message);
        return res.status(502).json({ 
          error: 'Invalid JSON response from Ollama API',
          rawResponse: responseText
        });
      }
    } catch (fetchError) {
      console.error('Network error connecting to Ollama:', fetchError.message);
      return res.status(502).json({ 
        error: 'Failed to connect to Ollama API',
        details: fetchError.message
      });
    }
  } catch (error) {
    console.error('General error in proxy server:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred in the proxy server',
      message: error.message
    });
  }
});

// Start the proxy server
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n=== Proxy Server Started ===`);
  console.log(`Listening on: http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Test Ollama connection: http://localhost:${PORT}/test-ollama`);
  console.log(`Generate text endpoint: http://localhost:${PORT}/api/generate (POST)`);
  console.log(`Chat endpoint: http://localhost:${PORT}/api/chat (POST)\n`);
});