# Roo CLI - Standalone AI Assistant

A standalone CLI tool that gives you the same AI responses as Roo Code, but works independently without needing VS Code. **Now with codebase context support!**

## Features

- 🤖 **Same AI Models**: Uses the same providers as Roo Code (Anthropic Claude, OpenAI GPT, OpenRouter)
- 🚀 **Standalone**: No VS Code required - works from any terminal
- ⚙️ **Easy Setup**: Simple configuration with API keys
- 💾 **Persistent Config**: Saves your settings automatically
- 📁 **Codebase Context**: Ask questions about your code and get intelligent answers

## Quick Start

### 1. Setup Configuration

First, configure your API keys:

```sh
node roo-cli.js --setup
```

This will guide you through:
- Choosing your AI provider (Anthropic, OpenAI, OpenRouter)
- Entering your API key
- Selecting a model
- Optionally setting a default codebase path

### 2. Send Prompts

**General questions:**
```sh
node roo-cli.js "Write a Python function to calculate fibonacci numbers"
```

**Questions about your codebase:**
```sh
node roo-cli.js --codebase /path/to/your/project "How does the authentication system work?"
```

### 3. Check Configuration

```sh
node roo-cli.js --config
```

## Codebase Context Features

The CLI can analyze your codebase and answer questions about it by:

- 📂 **Directory Structure**: Shows the project layout
- 📄 **Key Files**: Reads important files like `package.json`, `README.md`, etc.
- 🔍 **Code Analysis**: Understands your code structure and functionality
- 💡 **Intelligent Answers**: Provides context-aware responses about your specific code

### Supported File Types

The CLI recognizes and analyzes:
- **Code files**: `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.java`, `.cpp`, `.c`, `.cs`, `.php`, `.rb`, `.go`, `.rs`, `.swift`, `.kt`, `.scala`
- **Web files**: `.html`, `.css`, `.scss`
- **Config files**: `.json`, `.yaml`, `.yml`, `.toml`
- **Documentation**: `.md`, `.txt`
- **Scripts**: `.sh`, `.bash`, `.zsh`

## Supported Providers

| Provider | Default Model | Description |
|----------|---------------|-------------|
| **Anthropic** | `claude-3-5-sonnet-20241022` | Claude AI (same as Roo Code) |
| **OpenAI** | `gpt-4o` | GPT models |
| **OpenRouter** | `anthropic/claude-3-5-sonnet-20241022` | Access to multiple providers |

## Configuration

Your configuration is saved to `~/.roo-cli-config.json` and includes:

```json
{
  "provider": "anthropic",
  "apiKey": "your-api-key-here",
  "model": "claude-3-5-sonnet-20241022",
  "temperature": 0.7,
  "maxTokens": 4096,
  "codebasePath": "/path/to/your/default/codebase"
}
```

## Examples

### General AI Questions
```sh
# Ask for code help
node roo-cli.js "Explain this JavaScript code: function add(a, b) { return a + b; }"

# Get writing assistance
node roo-cli.js "Write a professional email to schedule a meeting"

# Ask for explanations
node roo-cli.js "What is the difference between REST and GraphQL APIs?"

# Get creative content
node roo-cli.js "Write a short story about a robot learning to paint"
```

### Codebase-Specific Questions
```sh
# Ask about project structure
node roo-cli.js --codebase /path/to/project "What is the overall architecture of this project?"

# Understand specific functionality
node roo-cli.js --codebase /path/to/project "How does the user authentication work?"

# Get help with specific files
node roo-cli.js --codebase /path/to/project "What does the main.js file do?"

# Ask about dependencies
node roo-cli.js --codebase /path/to/project "What are the main dependencies and what do they do?"

# Code review questions
node roo-cli.js --codebase /path/to/project "Are there any potential security issues in this code?"

# Refactoring suggestions
node roo-cli.js --codebase /path/to/project "How could I improve the error handling in this codebase?"
```

## API Keys

You'll need API keys from one of these services:

- **Anthropic**: Get your API key from [console.anthropic.com](https://console.anthropic.com)
- **OpenAI**: Get your API key from [platform.openai.com](https://platform.openai.com)
- **OpenRouter**: Get your API key from [openrouter.ai](https://openrouter.ai)

## Differences from Roo Code Extension

This CLI provides the same AI responses as Roo Code but without:
- VS Code integration
- Real-time file editing
- Terminal integration
- Advanced code analysis tools

For those features, use the full Roo Code VS Code extension.

---

**That's it!** You now have a standalone CLI that gives you the same AI responses as Roo Code, with the added ability to ask intelligent questions about your codebase! 🚀 