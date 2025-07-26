#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import readline from 'readline';

const CONFIG_FILE = path.join(os.homedir(), '.roo-cli-config.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setup() {
  console.log('🚀 Roo CLI Server Setup\n');
  
  try {
    // Check if config already exists
    let existingConfig = {};
    try {
      const configData = await fs.readFile(CONFIG_FILE, 'utf8');
      existingConfig = JSON.parse(configData);
      console.log('📁 Found existing configuration');
    } catch (error) {
      console.log('📁 Creating new configuration');
    }
    
    // Get AI provider
    console.log('\n🤖 AI Provider Configuration:');
    const provider = await question('Choose AI provider (anthropic/openai/openrouter) [anthropic]: ') || 'anthropic';
    
    // Get API keys
    console.log('\n🔑 API Keys:');
    const apiKey = await question(`${provider.charAt(0).toUpperCase() + provider.slice(1)} API Key: `);
    const openaiApiKey = await question('OpenAI API Key (for embeddings - required for indexing): ');
    
    if (!apiKey) {
      console.error('❌ API key is required');
      process.exit(1);
    }
    
    if (!openaiApiKey) {
      console.warn('⚠️  OpenAI API key is required for codebase indexing features');
    }
    
    // Get model
    console.log('\n🧠 Model Configuration:');
    let defaultModel;
    switch (provider) {
      case 'anthropic':
        defaultModel = 'claude-3-5-sonnet-20241022';
        break;
      case 'openai':
        defaultModel = 'gpt-4o';
        break;
      case 'openrouter':
        defaultModel = 'anthropic/claude-3-5-sonnet-20241022';
        break;
      default:
        defaultModel = 'claude-3-5-sonnet-20241022';
    }
    
    const model = await question(`Model [${defaultModel}]: `) || defaultModel;
    
    // Get Qdrant URL
    console.log('\n🗄️  Vector Database Configuration:');
    const qdrantUrl = await question('Qdrant URL [http://localhost:6333]: ') || 'http://localhost:6333';
    
    // Get default codebase path
    console.log('\n📁 Codebase Configuration:');
    const codebasePath = await question('Default codebase path (optional): ') || null;
    
    // Build config
    const config = {
      ...existingConfig,
      provider,
      apiKey,
      openaiApiKey,
      model,
      temperature: 0.7,
      maxTokens: 4096,
      codebasePath,
      qdrantUrl
    };
    
    // Save config
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    console.log('\n✅ Configuration saved successfully!');
    console.log(`📁 Config file: ${CONFIG_FILE}`);
    
    // Show next steps
    console.log('\n📋 Next Steps:');
    console.log('1. Start Qdrant vector database:');
    console.log('   docker run -p 6333:6333 qdrant/qdrant');
    console.log('\n2. Start the server:');
    console.log('   npm start');
    console.log('\n3. Index your codebase:');
    console.log('   curl -X POST http://localhost:3000/index \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"codebasePath": "/path/to/your/codebase"}\'');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

setup(); 