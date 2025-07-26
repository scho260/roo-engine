#!/usr/bin/env node

import express from 'express';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const CONFIG_FILE = path.join(os.homedir(), '.roo-cli-config.json');

// Default models (same as Roo Code)
const DEFAULT_MODELS = {
  anthropic: 'claude-3-5-sonnet-20241022',
  openai: 'gpt-4o',
  openrouter: 'anthropic/claude-3-5-sonnet-20241022'
};

// Code file extensions to include
const CODE_EXTENSIONS = [
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.php', 
  '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.html', '.css', '.scss',
  '.json', '.yaml', '.yml', '.toml', '.md', '.txt', '.sh', '.bash', '.zsh'
];

// Indexing configuration
const INDEXING_CONFIG = {
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  collectionName: 'roo-cli-codebase',
  vectorSize: 1536, // OpenAI text-embedding-3-small dimension
  maxFileSize: 1024 * 1024, // 1MB
  maxChunkSize: 1000, // characters per chunk
  overlapSize: 200, // characters overlap between chunks
};

// Global variables for indexing
let qdrantClient = null;
let openaiClient = null;
let isIndexing = false;
let indexedCodebases = new Set();

// Load configuration
async function loadConfig() {
  try {
    const configData = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    // Return default config if file doesn't exist
    return {
      provider: 'anthropic',
      apiKey: null,
      model: DEFAULT_MODELS.anthropic,
      temperature: 0.7,
      maxTokens: 4096,
      codebasePath: null,
      openaiApiKey: null, // For embeddings
      qdrantUrl: INDEXING_CONFIG.qdrantUrl
    };
  }
}

// Initialize Qdrant client
async function initializeQdrant() {
  if (!qdrantClient) {
    const config = await loadConfig();
    const clientConfig = { url: INDEXING_CONFIG.qdrantUrl };
    
    // Add API key if available
    if (config.qdrantApiKey) {
      clientConfig.apiKey = config.qdrantApiKey;
    }
    
    qdrantClient = new QdrantClient(clientConfig);
    
    // Check if collection exists, create if not
    try {
      const collections = await qdrantClient.getCollections();
      const collectionExists = collections.collections.some(
        col => col.name === INDEXING_CONFIG.collectionName
      );
      
      if (!collectionExists) {
        await qdrantClient.createCollection(INDEXING_CONFIG.collectionName, {
          vectors: {
            size: INDEXING_CONFIG.vectorSize,
            distance: 'Cosine'
          }
        });
        console.log(`✅ Created Qdrant collection: ${INDEXING_CONFIG.collectionName}`);
      }
    } catch (error) {
      console.error('❌ Failed to initialize Qdrant:', error.message);
      throw error;
    }
  }
  return qdrantClient;
}

// Initialize OpenAI client for embeddings
async function initializeOpenAI(config) {
  if (!openaiClient && config.openaiApiKey) {
    openaiClient = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }
  return openaiClient;
}

// Create embeddings for text
async function createEmbeddings(texts) {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized. Please set openaiApiKey in config.');
  }
  
  try {
    const response = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
      encoding_format: 'float',
    });
    
    return response.data.map(item => item.embedding);
  } catch (error) {
    throw new Error(`Failed to create embeddings: ${error.message}`);
  }
}

// Split text into chunks
function splitIntoChunks(text, maxChunkSize = INDEXING_CONFIG.maxChunkSize, overlapSize = INDEXING_CONFIG.overlapSize) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + maxChunkSize, text.length);
    const chunk = text.slice(start, end);
    chunks.push(chunk);
    
    if (end === text.length) break;
    start = end - overlapSize;
  }
  
  return chunks;
}

// Generate unique ID for code chunk
function generateChunkId(filePath, startLine, content) {
  const hash = crypto.createHash('md5').update(`${filePath}:${startLine}:${content}`).digest('hex');
  return hash;
}

// Index a single file
async function indexFile(filePath, codebasePath) {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size > INDEXING_CONFIG.maxFileSize) {
      console.log(`⚠️ Skipping large file: ${filePath} (${stats.size} bytes)`);
      return 0;
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    const relativePath = path.relative(codebasePath, filePath);
    
    // Split content into chunks
    const chunks = splitIntoChunks(content);
    let indexedChunks = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const startLine = Math.floor((i * (INDEXING_CONFIG.maxChunkSize - INDEXING_CONFIG.overlapSize)) / 50) + 1; // Approximate line number
      const endLine = startLine + Math.floor(chunk.length / 50);
      
      // Create embedding for chunk
      const embeddings = await createEmbeddings([chunk]);
      const embedding = embeddings[0];
      
      // Generate unique ID
      const chunkId = generateChunkId(relativePath, startLine, chunk);
      
      // Prepare point for Qdrant
      const point = {
        id: chunkId,
        vector: embedding,
        payload: {
          filePath: relativePath,
          codeChunk: chunk,
          startLine,
          endLine,
          codebasePath,
          timestamp: new Date().toISOString()
        }
      };
      
      // Upsert to Qdrant
      await qdrantClient.upsert(INDEXING_CONFIG.collectionName, {
        points: [point]
      });
      
      indexedChunks++;
    }
    
    return indexedChunks;
  } catch (error) {
    console.error(`❌ Failed to index file ${filePath}:`, error.message);
    return 0;
  }
}

// Recursively get all files in directory
async function getAllFiles(dirPath, arrayOfFiles = []) {
  try {
    const files = await fs.readdir(dirPath);
    
    for (const file of files) {
      if (file.startsWith('.') || file === 'node_modules' || file === '.git') {
        continue;
      }
      
      const fullPath = path.join(dirPath, file);
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory()) {
        arrayOfFiles = await getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(fullPath);
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }
  
  return arrayOfFiles;
}

// Index entire codebase
async function indexCodebase(codebasePath) {
  if (isIndexing) {
    throw new Error('Indexing already in progress');
  }
  
  if (!codebasePath) {
    throw new Error('Codebase path is required');
  }
  
  try {
    isIndexing = true;
    console.log(`🚀 Starting indexing of: ${codebasePath}`);
    
    // Initialize clients
    const config = await loadConfig();
    await initializeQdrant();
    await initializeOpenAI(config);
    
    // Get all files
    const allFiles = await getAllFiles(codebasePath);
    const codeFiles = allFiles.filter(file => {
      const ext = path.extname(file);
      return CODE_EXTENSIONS.includes(ext);
    });
    
    console.log(`📁 Found ${codeFiles.length} code files to index`);
    
    let totalChunks = 0;
    let processedFiles = 0;
    
    // Index files in batches
    const batchSize = 10;
    for (let i = 0; i < codeFiles.length; i += batchSize) {
      const batch = codeFiles.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (file) => {
        const chunks = await indexFile(file, codebasePath);
        return { file, chunks };
      });
      
      const results = await Promise.all(batchPromises);
      
      for (const result of results) {
        totalChunks += result.chunks;
        processedFiles++;
        
        if (processedFiles % 10 === 0) {
          console.log(`📊 Progress: ${processedFiles}/${codeFiles.length} files, ${totalChunks} chunks indexed`);
        }
      }
    }
    
    // Mark codebase as indexed
    indexedCodebases.add(codebasePath);
    
    console.log(`✅ Indexing complete! Indexed ${totalChunks} chunks from ${processedFiles} files`);
    return { totalChunks, processedFiles };
    
  } catch (error) {
    console.error('❌ Indexing failed:', error.message);
    throw error;
  } finally {
    isIndexing = false;
  }
}

// Search indexed codebase
async function searchCodebase(query, codebasePath = null, limit = 10) {
  try {
    const config = await loadConfig();
    await initializeQdrant();
    await initializeOpenAI(config);
    
    // Create embedding for query
    const embeddings = await createEmbeddings([query]);
    const queryEmbedding = embeddings[0];
    
    // Build filter for specific codebase if provided
    let filter = null;
    if (codebasePath) {
      filter = {
        must: [
          {
            key: 'codebasePath',
            match: { value: codebasePath }
          }
        ]
      };
    }
    
    // Search in Qdrant
    const searchResult = await qdrantClient.search(INDEXING_CONFIG.collectionName, {
      vector: queryEmbedding,
      filter,
      limit,
      with_payload: true,
      score_threshold: 0.7
    });
    
    return searchResult.map(point => ({
      score: point.score,
      filePath: point.payload.filePath,
      codeChunk: point.payload.codeChunk,
      startLine: point.payload.startLine,
      endLine: point.payload.endLine,
      codebasePath: point.payload.codebasePath
    }));
    
  } catch (error) {
    console.error('❌ Search failed:', error.message);
    throw error;
  }
}

// Get key files content
async function getKeyFiles(rootPath) {
  const keyFiles = [];
  const importantFiles = [
    'package.json', 'README.md', 'requirements.txt', 'Cargo.toml', 'go.mod',
    'pom.xml', 'build.gradle', 'Gemfile', 'composer.json', 'pyproject.toml'
  ];
  
  try {
    const items = await fs.readdir(rootPath);
    
    for (const item of items) {
      if (importantFiles.includes(item)) {
        try {
          const content = await fs.readFile(path.join(rootPath, item), 'utf8');
          keyFiles.push(`### ${item}:\n\`\`\`\n${content.slice(0, 1000)}${content.length > 1000 ? '\n...' : ''}\n\`\`\``);
        } catch (error) {
          // Skip files that can't be read
        }
      }
    }
  } catch (error) {
    // Directory might not exist
  }
  
  return keyFiles;
}

// Get relevant code files content
async function getCodeFiles(rootPath, maxFiles = 10) {
  const codeFiles = [];
  
  try {
    const allFiles = await getAllFiles(rootPath);
    const relevantFiles = allFiles
      .filter(file => {
        const ext = path.extname(file);
        return CODE_EXTENSIONS.includes(ext) && !file.includes('node_modules') && !file.includes('.git');
      })
      .slice(0, maxFiles);
    
    for (const file of relevantFiles) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const relativePath = path.relative(rootPath, file);
        codeFiles.push(`### ${relativePath}:\n\`\`\`${getFileExtension(file)}\n${content.slice(0, 2000)}${content.length > 2000 ? '\n...' : ''}\n\`\`\``);
      } catch (error) {
        // Skip files that can't be read
      }
    }
  } catch (error) {
    // Directory might not exist
  }
  
  return codeFiles;
}

// Get file extension for syntax highlighting
function getFileExtension(filePath) {
  const ext = path.extname(filePath);
  const extMap = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.jsx': 'javascript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.php': 'php',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.md': 'markdown',
    '.txt': 'text',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash'
  };
  return extMap[ext] || 'text';
}

// Get codebase context
async function getCodebaseContext(codebasePath) {
  if (!codebasePath) return '';
  
  try {
    const context = [];
    
    // Get directory structure
    const structure = await getDirectoryStructure(codebasePath);
    context.push(`## Directory Structure:\n${structure}\n`);
    
    // Get key files content
    const keyFiles = await getKeyFiles(codebasePath);
    if (keyFiles.length > 0) {
      context.push(`## Key Files:\n${keyFiles.join('\n\n')}\n`);
    }
    
    // Get actual code files content
    const codeFiles = await getCodeFiles(codebasePath);
    if (codeFiles.length > 0) {
      context.push(`## Code Files:\n${codeFiles.join('\n\n')}\n`);
    }
    
    return context.join('\n');
  } catch (error) {
    console.warn(`Warning: Could not read codebase context: ${error.message}`);
    return '';
  }
}

// Get indexed codebase context (using vector search)
async function getIndexedCodebaseContext(query, codebasePath) {
  if (!codebasePath) return '';
  
  try {
    // Check if codebase is indexed
    if (!indexedCodebases.has(codebasePath)) {
      console.log(`⚠️ Codebase not indexed: ${codebasePath}`);
      return '';
    }
    
    // Search for relevant code chunks
    const searchResults = await searchCodebase(query, codebasePath, 5);
    
    if (searchResults.length === 0) {
      return '';
    }
    
    const context = ['## Relevant Code (from indexed search):\n'];
    
    searchResults.forEach((result, index) => {
      context.push(`### ${result.filePath} (lines ${result.startLine}-${result.endLine}, score: ${result.score.toFixed(3)}):\n\`\`\`${getFileExtension(result.filePath)}\n${result.codeChunk}\n\`\`\`\n`);
    });
    
    return context.join('\n');
  } catch (error) {
    console.warn(`Warning: Could not get indexed context: ${error.message}`);
    return '';
  }
}

// Get directory structure
async function getDirectoryStructure(rootPath, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth) return '';
  
  try {
    const items = await fs.readdir(rootPath);
    const structure = [];
    
    for (const item of items.slice(0, 20)) { // Limit to 20 items per directory
      const itemPath = path.join(rootPath, item);
      const stats = await fs.stat(itemPath);
      
      if (stats.isDirectory()) {
        if (!item.startsWith('.') && !item.startsWith('node_modules')) {
          const subStructure = await getDirectoryStructure(itemPath, maxDepth, currentDepth + 1);
          structure.push(`${'  '.repeat(currentDepth)}📁 ${item}/`);
          if (subStructure) {
            structure.push(subStructure);
          }
        }
      } else if (stats.isFile()) {
        const ext = path.extname(item);
        if (CODE_EXTENSIONS.includes(ext) || item === 'package.json' || item === 'README.md') {
          structure.push(`${'  '.repeat(currentDepth)}📄 ${item}`);
        }
      }
    }
    
    return structure.join('\n');
  } catch (error) {
    return '';
  }
}

// Create AI client based on provider
function createClient(config) {
  switch (config.provider) {
    case 'anthropic':
      return new Anthropic({
        apiKey: config.apiKey,
      });
    case 'openai':
      return new OpenAI({
        apiKey: config.apiKey,
      });
    case 'openrouter':
      return new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: config.apiKey,
        defaultHeaders: {
          'HTTP-Referer': 'https://roo-cli.com',
          'X-Title': 'Roo CLI'
        }
      });
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

// Get persona-specific prompt
function getPersonaPrompt(persona, codebaseContext, userPrompt) {
  const basePrompt = codebaseContext ? 
    `You are an AI assistant helping with a codebase. Here is the context about the codebase:

${codebaseContext}

Now, please answer this question about the codebase:

${userPrompt}` : userPrompt;

  switch (persona) {
    case 'salesperson':
      return `${basePrompt}

IMPORTANT: Respond like a professional salesperson trying to sell this product to a potential customer:
1. Focus on business value, benefits, and ROI
2. Use persuasive, enthusiastic language
3. Highlight key features and competitive advantages
4. Address potential customer pain points
5. Include specific benefits and use cases
6. Be conversational and engaging
7. Reference specific features from the codebase when relevant
8. Avoid overly technical jargon unless explaining benefits

Make it sound like you're genuinely excited about this product and its value to the customer.`;

    case 'executive':
      return `${basePrompt}

IMPORTANT: Respond like a business executive presenting to stakeholders:
1. Focus on strategic value and business impact
2. Use high-level, strategic language
3. Emphasize ROI, market position, and competitive advantages
4. Address business challenges and solutions
5. Include market opportunities and growth potential
6. Be confident and authoritative
7. Reference business metrics and outcomes when possible

Present this as a strategic business opportunity.`;

    case 'developer':
      return `${basePrompt}

IMPORTANT: Respond like a senior developer explaining to another developer:
1. Focus on technical architecture and implementation details
2. Use technical terminology and code examples
3. Explain design patterns, best practices, and technical decisions
4. Include code snippets and technical explanations
5. Address technical challenges and solutions
6. Be precise and technically accurate
7. Reference specific code patterns and implementations

Provide detailed technical insights and code-level explanations.`;

    case 'demo':
      return `${basePrompt}

IMPORTANT: You are a product demo specialist. Always structure your response with:

1. **Short Blurb** (2-3 energetic sentences): Concise, benefit-focused summary
2. **Demo Steps**: Numbered, actionable steps with UI element references in parentheses
3. **Summary Table**: Table mapping each step to its UI selector

Example format:
---
**Short Blurb:**
[Energetic, benefit-focused description]

**Demo Steps:**
1. Open the sidebar (.sidebar)
2. Click the feature tab (.feature-tab)
3. [Continue with specific steps]

| Step | UI Element | Selector |
|------|------------|----------|
| 1    | Sidebar    | .sidebar |
| 2    | Feature tab| .feature-tab |
---

Focus on user actions and UI elements. Make steps executable and include real or plausible CSS selectors.`;

    case 'technical':
    default:
      return `${basePrompt}

IMPORTANT: Structure your response in this format:

1. **Short Blurb** (2-3 sentences): Give a concise, energetic summary of the feature/concept
2. **Step-by-Step Guide**: Provide actionable steps with UI element references in parentheses
3. **Summary Table**: Include a table mapping steps to UI selectors

Example format:
---
**Short Blurb:**
[Concise, punchy description]

**Demo Steps:**
1. Open the sidebar (.sidebar)
2. Click the feature tab (.feature-tab)
3. [Continue with specific steps and element references]

| Step | UI Element | Selector |
|------|------------|----------|
| 1    | Sidebar    | .sidebar |
| 2    | Feature tab| .feature-tab |
---

When answering questions about the codebase:
1. Reference specific code snippets and file names from the provided context
2. Show actual code examples from the files when relevant
3. Explain how the code works with concrete examples
4. Point to specific functions, classes, or methods in the code
5. Provide detailed, technical explanations with code references
6. Always include UI element references in parentheses for any user interface components

Please provide detailed, helpful answers about the code structure, functionality, and include relevant code examples from the actual files.`;
  }
}

// Send message to AI with codebase context
async function sendMessage(config, prompt, codebasePath = null, persona = 'technical', useIndexedSearch = false) {
  const client = createClient(config);
  
  let codebaseContext = '';
  
  if (useIndexedSearch && (codebasePath || config.codebasePath)) {
    // Use indexed search for more relevant context
    codebaseContext = await getIndexedCodebaseContext(prompt, codebasePath || config.codebasePath);
  }
  
  // Fall back to traditional context if indexed search didn't return results
  if (!codebaseContext) {
    codebaseContext = await getCodebaseContext(codebasePath || config.codebasePath);
  }
  
  // Build the full prompt with persona-specific instructions
  const fullPrompt = getPersonaPrompt(persona, codebaseContext, prompt);
  
  try {
    if (config.provider === 'anthropic') {
      const response = await client.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        messages: [{ role: 'user', content: fullPrompt }]
      });
      return response.content[0].text;
    } else {
      // OpenAI and OpenRouter
      const response = await client.chat.completions.create({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        messages: [{ role: 'user', content: fullPrompt }]
      });
      return response.choices[0].message.content;
    }
  } catch (error) {
    throw new Error(`AI request failed: ${error.message}`);
  }
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Roo CLI Server with Codebase Indexing',
    features: {
      chat: 'AI-powered chat with persona support',
      indexing: 'Vector-based codebase indexing for faster, more accurate queries',
      search: 'Semantic search through indexed codebases'
    },
    endpoints: {
      chat: {
        method: 'POST',
        path: '/chat',
        body: {
          prompt: 'Your question or prompt',
          persona: 'salesperson|technical|executive|developer (optional, default: technical)',
          codebasePath: 'Path to codebase (optional)',
          useIndexedSearch: 'Use indexed search for better context (optional, default: false)'
        }
      },
      index: {
        method: 'POST',
        path: '/index',
        body: {
          codebasePath: 'Path to codebase to index'
        }
      },
      search: {
        method: 'POST',
        path: '/search',
        body: {
          query: 'Search query',
          codebasePath: 'Path to codebase (optional)',
          limit: 'Maximum results (optional, default: 10)'
        }
      },
      status: {
        method: 'GET',
        path: '/index/status'
      }
    },
    examples: [
      {
        description: 'Chat with indexed search',
        curl: 'curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" -d \'{"prompt": "How does authentication work?", "persona": "technical", "codebasePath": "/path/to/codebase", "useIndexedSearch": true}\''
      },
      {
        description: 'Index a codebase',
        curl: 'curl -X POST http://localhost:3000/index -H "Content-Type: application/json" -d \'{"codebasePath": "/path/to/codebase"}\''
      },
      {
        description: 'Search indexed codebase',
        curl: 'curl -X POST http://localhost:3000/search -H "Content-Type: application/json" -d \'{"query": "authentication middleware", "codebasePath": "/path/to/codebase"}\''
      }
    ]
  });
});

app.post('/chat', async (req, res) => {
  try {
    const { prompt, persona = 'technical', codebasePath, useIndexedSearch = false } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    const config = await loadConfig();
    
    if (!config.apiKey) {
      return res.status(500).json({ error: 'No API key configured. Please run setup first.' });
    }
    
    console.log(`🤖 Request: ${prompt}`);
    console.log(`🎭 Persona: ${persona}`);
    console.log(`🔍 Using indexed search: ${useIndexedSearch}`);
    if (codebasePath) {
      console.log(`📁 Codebase: ${codebasePath}`);
    }
    
    const response = await sendMessage(config, prompt, codebasePath, persona, useIndexedSearch);
    
    res.json({
      success: true,
      response,
      metadata: {
        provider: config.provider,
        model: config.model,
        persona,
        codebasePath: codebasePath || config.codebasePath,
        useIndexedSearch
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Index a codebase
app.post('/index', async (req, res) => {
  try {
    const { codebasePath } = req.body;
    
    if (!codebasePath) {
      return res.status(400).json({ error: 'Codebase path is required' });
    }
    
    const config = await loadConfig();
    
    if (!config.openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key is required for indexing. Please set openaiApiKey in config.' });
    }
    
    console.log(`🚀 Indexing request for: ${codebasePath}`);
    
    const result = await indexCodebase(codebasePath);
    
    res.json({
      success: true,
      message: 'Indexing completed successfully',
      result
    });
    
  } catch (error) {
    console.error('❌ Indexing error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Search indexed codebase
app.post('/search', async (req, res) => {
  try {
    const { query, codebasePath, limit = 10 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const config = await loadConfig();
    
    if (!config.openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key is required for search. Please set openaiApiKey in config.' });
    }
    
    console.log(`🔍 Search request: ${query}`);
    if (codebasePath) {
      console.log(`📁 Codebase: ${codebasePath}`);
    }
    
    const results = await searchCodebase(query, codebasePath, limit);
    
    res.json({
      success: true,
      query,
      results,
      metadata: {
        codebasePath,
        limit,
        totalResults: results.length
      }
    });
    
  } catch (error) {
    console.error('❌ Search error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get indexing status
app.get('/index/status', async (req, res) => {
  try {
    const config = await loadConfig();
    
    res.json({
      success: true,
      isIndexing,
      indexedCodebases: Array.from(indexedCodebases),
      hasOpenAIKey: !!config.openaiApiKey,
      qdrantUrl: INDEXING_CONFIG.qdrantUrl
    });
    
  } catch (error) {
    console.error('❌ Status error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Clear index for a codebase
app.delete('/index/:codebasePath', async (req, res) => {
  try {
    const { codebasePath } = req.params;
    const decodedPath = decodeURIComponent(codebasePath);
    
    if (!qdrantClient) {
      await initializeQdrant();
    }
    
    // Delete points for this codebase
    await qdrantClient.delete(INDEXING_CONFIG.collectionName, {
      filter: {
        must: [
          {
            key: 'codebasePath',
            match: { value: decodedPath }
          }
        ]
      }
    });
    
    // Remove from tracked codebases
    indexedCodebases.delete(decodedPath);
    
    res.json({
      success: true,
      message: `Index cleared for: ${decodedPath}`
    });
    
  } catch (error) {
    console.error('❌ Clear index error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Roo CLI Server running on http://localhost:${PORT}`);
  console.log(`📡 Ready to receive requests via ngrok`);
  console.log(`💡 Use: curl -X POST http://localhost:${PORT}/chat -H "Content-Type: application/json" -d '{"prompt": "What are buyer signals?", "persona": "salesperson"}'`);
});

// Handle process exit
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Roo CLI Server...');
  process.exit(0);
}); 