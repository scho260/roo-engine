#!/usr/bin/env node

import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

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
      codebasePath: null
    };
  }
}

// Save configuration
async function saveConfig(config) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
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

// Setup configuration
async function setup() {
  console.log('🤖 Roo CLI Setup\n');
  
  const config = await loadConfig();
  
  console.log('Available providers:');
  console.log('1. Anthropic (Claude) - claude-3-5-sonnet-20241022');
  console.log('2. OpenAI (GPT) - gpt-4o');
  console.log('3. OpenRouter (Multiple models)');
  console.log('4. Exit setup\n');
  
  const providerChoice = await askQuestion('Choose provider (1-4): ');
  
  if (providerChoice === '4') {
    console.log('Setup cancelled.');
    return;
  }
  
  const providers = ['anthropic', 'openai', 'openrouter'];
  const provider = providers[parseInt(providerChoice) - 1];
  
  if (!provider) {
    console.log('Invalid choice.');
    return;
  }
  
  const apiKey = await askQuestion(`Enter your ${provider} API key: `);
  const model = await askQuestion(`Enter model ID (or press Enter for default): `) || DEFAULT_MODELS[provider];
  const codebasePath = await askQuestion('Enter path to your codebase (or press Enter to skip): ');
  
  const newConfig = {
    ...config,
    provider,
    apiKey,
    model,
    codebasePath: codebasePath || null
  };
  
  await saveConfig(newConfig);
  console.log('\n✅ Configuration saved!');
}

// Simple question prompt
function askQuestion(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
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

// Send message to AI with codebase context
async function sendMessage(config, prompt, codebasePath = null) {
  const client = createClient(config);
  
  // Get codebase context if available
  const codebaseContext = await getCodebaseContext(codebasePath || config.codebasePath);
  
  // Build the full prompt with context
  let fullPrompt = prompt;
  if (codebaseContext) {
    fullPrompt = `You are an AI assistant helping with a codebase. Here is the context about the codebase:

${codebaseContext}

Now, please answer this question about the codebase:

${prompt}

IMPORTANT: When answering questions about the codebase:
1. Reference specific code snippets and file names from the provided context
2. Show actual code examples from the files when relevant
3. Explain how the code works with concrete examples
4. Point to specific functions, classes, or methods in the code
5. Provide detailed, technical explanations with code references

Please provide detailed, helpful answers about the code structure, functionality, and include relevant code examples from the actual files.`;
  }
  
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

// Main CLI function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('🤖 Roo CLI - Standalone AI Assistant\n');
    console.log('Usage:');
    console.log('  node roo-cli.js "your prompt"                    - Send a prompt to AI');
    console.log('  node roo-cli.js --codebase /path/to/code "prompt" - Ask about specific codebase');
    console.log('  node roo-cli.js --setup                          - Configure API keys');
    console.log('  node roo-cli.js --config                         - Show current config');
    return;
  }
  
  if (args[0] === '--setup') {
    await setup();
    return;
  }
  
  if (args[0] === '--config') {
    const config = await loadConfig();
    console.log('Current configuration:');
    console.log(JSON.stringify(config, null, 2));
    return;
  }
  
  // Handle --codebase flag
  let codebasePath = null;
  let prompt = '';
  
  if (args[0] === '--codebase') {
    if (args.length < 3) {
      console.log('❌ Usage: node roo-cli.js --codebase /path/to/code "your prompt"');
      return;
    }
    codebasePath = args[1];
    prompt = args.slice(2).join(' ');
  } else {
    prompt = args.join(' ');
  }
  
  const config = await loadConfig();
  
  if (!config.apiKey) {
    console.log('❌ No API key configured. Run "node roo-cli.js --setup" to configure.');
    return;
  }
  
  const provider = config.provider;
  const model = config.model;
  
  if (codebasePath) {
    console.log(`🤖 Analyzing codebase: ${codebasePath}`);
    console.log(`📡 Sending to ${provider} (${model})...\n`);
  } else {
    console.log(`🤖 Sending to ${provider} (${model})...\n`);
  }
  
  try {
    const response = await sendMessage(config, prompt, codebasePath);
    console.log('AI Response:');
    console.log(response);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Handle process exit
process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

// Run the CLI
main().catch(console.error); 