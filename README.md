# AI Personal Assistant

A multi-platform AI assistant for sales and finance management with intelligent suggestions and Babylon wealth principles.

## Features

- 🤖 **Multi-AI Support**: OpenAI or Claude
- 📱 **Multi-Platform**: Telegram, WhatsApp, SMS
- 👤 **User Management**: Onboarding and service selection
- 📊 **Sales Management**: Lead tracking with intelligent suggestions
- 💰 **Finance Management**: Babylon principles-based wealth building
- 🔌 **Pluggable Architecture**: Easy to add new platforms/services

## Quick Start

1. **Clone and Install:**
```bash
git clone <your-repo>
cd ai-personal-assistant
npm install
```

2. **Setup Environment:**
```bash
cp .env.example .env.local
# Fill in your API keys (see setup.md for details)
```

3. **Setup Database:**
```bash
npm run setup
```

4. **Run:**
```bash
npm run dev
# Server runs on http://localhost:3000
```

5. **Create Telegram Bots:**
   - Message @BotFather on Telegram
   - Create 3 bots: Onboarding, Sales, Finance
   - Add tokens to `.env.local`
   - Set webhooks (see setup.md)

## Usage

### Onboarding
1. Start with the onboarding bot
2. Choose services: sales, finance, or both
3. Get connected to your service bots

### Sales Bot
```
"New lead TechCorp +27821234567"
"Called Mike, he's interested but budget is tight"
"Sarah replied, wants demo next week"
"Show pipeline"
```

### Finance Bot
```
"Got paid R15000 today"
"Spent R800 on groceries"
"Invested R5000 in ETFs"
"Show summary"
```

## API Endpoints

- `GET /api/health` - System health check
- `GET /api/users` - List all users
- `POST /api/webhooks/{platform}/{service}` - Message webhooks

## Architecture

```
User Message → Platform Provider → Message Router → Service (Sales/Finance/Onboard) → AI → Database → Response
```

## Adding New Platforms

1. Create provider in `src/lib/messaging/providers/`
2. Add to factory
3. Create webhook routes
4. Configure platform webhooks

See `setup.md` for detailed instructions