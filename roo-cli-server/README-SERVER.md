# Roo CLI Server

A simple HTTP server wrapper for the Roo CLI functionality that can be exposed via ngrok for remote access.

## Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure API Keys
First, set up your API keys using the original CLI:
```bash
node roo-cli.js --setup
```

This will create a `.roo-cli-config.json` file in your home directory with your API keys.

### 3. Start the Server
```bash
npm start
```

The server will start on `http://localhost:3000`

### 4. Expose via ngrok
```bash
ngrok http 3000
```

This will give you a public URL like `https://abc123.ngrok.io`

## Usage

### API Endpoints

#### GET `/`
Returns usage information and examples.

#### POST `/chat`
Send a chat request to the AI.

**Request Body:**
```json
{
  "prompt": "What are buyer signals?",
  "persona": "salesperson",
  "codebasePath": "/path/to/codebase"
}
```

**Parameters:**
- `prompt` (required): Your question or prompt
- `persona` (optional): One of `salesperson`, `technical`, `executive`, `developer` (default: `technical`)
- `codebasePath` (optional): Path to a codebase for context

**Response:**
```json
{
  "success": true,
  "response": "AI response here...",
  "metadata": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "persona": "salesperson",
    "codebasePath": "/path/to/codebase"
  }
}
```

### Examples

#### Using curl
```bash
# Basic request
curl -X POST https://your-ngrok-url.ngrok.io/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What are buyer signals?", "persona": "salesperson"}'

# With codebase context
curl -X POST https://your-ngrok-url.ngrok.io/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "How does the authentication work?", "persona": "developer", "codebasePath": "/path/to/your/project"}'
```

#### Using JavaScript
```javascript
const response = await fetch('https://your-ngrok-url.ngrok.io/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'What are buyer signals?',
    persona: 'salesperson'
  })
});

const data = await response.json();
console.log(data.response);
```

#### Using Python
```python
import requests

response = requests.post('https://your-ngrok-url.ngrok.io/chat', 
  json={
    'prompt': 'What are buyer signals?',
    'persona': 'salesperson'
  }
)

print(response.json()['response'])
```

## Available Personas

- **salesperson**: Responds like a professional salesperson selling the product
- **technical**: Provides detailed technical explanations with code references (default)
- **executive**: Responds like a business executive presenting to stakeholders
- **developer**: Responds like a senior developer explaining to another developer

## Security Notes

⚠️ **Important Security Considerations:**

1. **API Keys**: Your API keys are stored locally and used by the server. Never expose your API keys publicly.

2. **ngrok Exposure**: When using ngrok, your server becomes publicly accessible. Consider:
   - Using ngrok authentication
   - Implementing rate limiting
   - Adding request validation
   - Using HTTPS (ngrok provides this by default)

3. **Codebase Access**: If you provide a `codebasePath`, the server will read files from that directory. Be careful about exposing sensitive code.

## Health Check

Check if the server is running:
```bash
curl https://your-ngrok-url.ngrok.io/health
```

## Troubleshooting

### "No API key configured"
Run the setup first:
```bash
node roo-cli.js --setup
```

### "Port already in use"
Change the port:
```bash
PORT=3001 npm start
```

### ngrok connection issues
- Make sure ngrok is running: `ngrok http 3000`
- Check the ngrok URL in the ngrok dashboard
- Ensure your firewall allows the connection

## Development

For development with auto-restart:
```bash
npm run dev
``` 