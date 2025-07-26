# Roo CLI Server with Codebase Indexing

A powerful HTTP server that provides AI-powered code analysis with vector-based codebase indexing for faster, more accurate queries.

## Features

- 🤖 **AI Chat**: Multi-persona AI chat (technical, salesperson, executive, developer)
- 🔍 **Vector Indexing**: Semantic codebase indexing using OpenAI embeddings and Qdrant vector database
- ⚡ **Fast Search**: Lightning-fast semantic search through indexed codebases
- 🎭 **Persona Support**: Different AI personalities for different use cases
- 🔧 **Multiple Providers**: Support for Anthropic, OpenAI, and OpenRouter

## Prerequisites

1. **Node.js 18+** installed
2. **Qdrant Vector Database** running (for indexing)
3. **API Keys** for your chosen AI providers

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Qdrant (Vector Database)

#### Option A: Using Docker (Recommended)

```bash
docker run -p 6333:6333 qdrant/qdrant
```

#### Option B: Using Qdrant Cloud

Sign up at [qdrant.cloud](https://qdrant.cloud) and get your URL.

### 3. Configure API Keys

Create a configuration file at `~/.roo-cli-config.json`:

```json
{
  "provider": "anthropic",
  "apiKey": "your-anthropic-api-key",
  "openaiApiKey": "your-openai-api-key-for-embeddings",
  "model": "claude-3-5-sonnet-20241022",
  "temperature": 0.7,
  "maxTokens": 4096,
  "codebasePath": "/path/to/your/codebase",
  "qdrantUrl": "http://localhost:6333"
}
```

**Required API Keys:**
- `apiKey`: For your main AI provider (Anthropic, OpenAI, or OpenRouter)
- `openaiApiKey`: For creating embeddings (required for indexing)

### 4. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

## Usage

### 1. Index a Codebase

First, index your codebase for faster queries:

```bash
curl -X POST http://localhost:3000/index \
  -H "Content-Type: application/json" \
  -d '{"codebasePath": "/path/to/your/codebase"}'
```

### 2. Chat with Indexed Search

Use the indexed search for more accurate responses:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "How does authentication work in this codebase?",
    "persona": "technical",
    "codebasePath": "/path/to/your/codebase",
    "useIndexedSearch": true
  }'
```

### 3. Search Indexed Codebase

Search for specific code patterns:

```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "authentication middleware",
    "codebasePath": "/path/to/your/codebase",
    "limit": 5
  }'
```

### 4. Check Indexing Status

```bash
curl http://localhost:3000/index/status
```

## API Endpoints

### POST `/chat`
AI-powered chat with persona support.

**Body:**
```json
{
  "prompt": "Your question",
  "persona": "technical|salesperson|executive|developer",
  "codebasePath": "/path/to/codebase",
  "useIndexedSearch": true
}
```

### POST `/index`
Index a codebase for vector search.

**Body:**
```json
{
  "codebasePath": "/path/to/codebase"
}
```

### POST `/search`
Search indexed codebase.

**Body:**
```json
{
  "query": "search query",
  "codebasePath": "/path/to/codebase",
  "limit": 10
}
```

### GET `/index/status`
Get indexing status and configuration.

### DELETE `/index/:codebasePath`
Clear index for a specific codebase.

## Personas

- **technical**: Detailed technical explanations with code examples
- **salesperson**: Business-focused, benefit-oriented responses
- **executive**: High-level strategic insights
- **developer**: Code-focused explanations with implementation details

## Environment Variables

- `PORT`: Server port (default: 3000)
- `QDRANT_URL`: Qdrant server URL (default: http://localhost:6333)

## Performance Tips

1. **Index Once**: Index your codebase once, then use `useIndexedSearch: true` for faster queries
2. **Batch Processing**: The indexing process handles files in batches for optimal performance
3. **File Size Limits**: Files larger than 1MB are automatically skipped
4. **Chunking**: Code is split into 1000-character chunks with 200-character overlap for better context

## Troubleshooting

### Qdrant Connection Issues
- Ensure Qdrant is running on the correct port
- Check firewall settings
- Verify the URL in your config file

### API Key Issues
- Ensure both `apiKey` and `openaiApiKey` are set
- Verify API keys are valid and have sufficient credits
- Check rate limits for your API provider

### Indexing Issues
- Ensure the codebase path is correct and accessible
- Check file permissions
- Monitor server logs for specific error messages

## Architecture

The server uses:
- **OpenAI Embeddings**: For creating vector representations of code
- **Qdrant Vector Database**: For storing and searching embeddings
- **Express.js**: For the HTTP server
- **Multiple AI Providers**: For chat responses

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License 