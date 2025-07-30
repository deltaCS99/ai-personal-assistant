# Setup Instructions

## Prerequisites

- Node.js 18+
- OpenAI or Claude API key
- Telegram account

## Step-by-Step Setup

### 1. Environment Variables

Copy `.env.example` to `.env.local` and fill in:

#### Required (AI)
```bash
AI_PROVIDER=openai  # or claude
OPENAI_API_KEY=sk-your-key-here
# OR
ANTHROPIC_API_KEY=your-claude-key
```

#### Required (Telegram)
Create 3 bots via @BotFather:

1. **Onboarding Bot:**
   - `/newbot` → Name: "Your Assistant Onboarding" → Username: "yourassistant_onboard_bot"
   - Copy token to `TELEGRAM_BOT_TOKEN_ONBOARD`

2. **Sales Bot:**
   - `/newbot` → Name: "Your Sales Assistant" → Username: "yourassistant_sales_bot"
   - Copy token to `TELEGRAM_BOT_TOKEN_SALES`

3. **Finance Bot:**
   - `/newbot` → Name: "Your Finance Assistant" → Username: "yourassistant_finance_bot"
   - Copy token to `TELEGRAM_BOT_TOKEN_FINANCE`

#### Optional (WhatsApp)
```bash
WHATSAPP_ACCESS_TOKEN=your-token
WHATSAPP_PHONE_NUMBER_ID=your-id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your-verify-token
```

#### Optional (SMS)
```bash
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890
```

### 2. Database Setup

```bash
npm run setup
```

This creates SQLite database and generates Prisma client.

### 3. Run Development Server

```bash
npm run dev
```

Server starts on http://localhost:3000

### 4. Setup Webhooks (Production)

Deploy to Vercel/Railway/etc first, then:

```bash
# Replace YOUR_DOMAIN with your actual domain
DOMAIN="https://your-app.vercel.app"

# Onboarding bot
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN_ONBOARD}/setWebhook" \
     -H "Content-Type: application/json" \
     -d "{\"url\": \"${DOMAIN}/api/webhooks/telegram/onboard\"}"

# Sales bot
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN_SALES}/setWebhook" \
     -H "Content-Type: application/json" \
     -d "{\"url\": \"${DOMAIN}/api/webhooks/telegram/sales\"}"

# Finance bot
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN_FINANCE}/setWebhook" \
     -H "Content-Type: application/json" \
     -d "{\"url\": \"${DOMAIN}/api/webhooks/telegram/finance\"}"
```

### 5. Test the System

1. **Start with Onboarding Bot:**
   - Find your onboarding bot on Telegram
   - Send: "Hi"
   - Choose services: "both"

2. **Test Sales Bot:**
   - Send: "New lead John +27821234567"
   - Send: "Called John, he's interested"

3. **Test Finance Bot:**
   - Send: "Earned R5000 today"
   - Send: "Spent R200 on groceries"

### 6. Deployment Options

#### Vercel (Recommended)
```bash
npm install -g vercel
vercel login
vercel --prod
```

Add environment variables in Vercel dashboard.

#### Railway
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

#### Local Development with ngrok
```bash
npm install -g ngrok
ngrok http 3000
# Use ngrok URL for webhooks
```

### 7. Database Management

```bash
# View data
npm run db:studio

# Reset database
rm prisma/dev.db
npm run setup

# Create migration
npm run db:migrate
```

### 8. Monitoring and Logs

- Health check: `GET /api/health`
- View users: `GET /api/users`
- Check logs in your deployment platform

## Troubleshooting

### Common Issues

1. **Bot not responding:**
   - Check webhook URLs are correct
   - Verify tokens in environment variables
   - Check logs for errors

2. **Database errors:**
   - Run `npm run setup` again
   - Check file permissions for SQLite

3. **AI not working:**
   - Verify API keys are correct
   - Check AI provider is set correctly
   - Monitor API usage/limits

### Testing Webhooks Locally

```bash
# Install webhook testing tool
npm install -g webhook-test

# Test telegram webhook
webhook-test --port 3000 --path /api/webhooks/telegram/sales
```

## Security Notes

- Never commit `.env.local` to git
- Use strong webhook secrets in production
- Regularly rotate API keys
- Monitor usage and costs

## Support

Check logs first:
- Development: Console output
- Production: Platform logs (Vercel/Railway)
- Database: `npm run db:studio`

For issues, check:
1. Environment variables are set
2. Webhooks are configured correctly
3. API keys are valid
4. Database is accessible

---

## Complete File Structure for Download

```
ai-personal-assistant/
├── package.json                 ✅ Ready
├── tsconfig.json               ✅ Ready  
├── next.config.js              ✅ Ready
├── .env.example                ✅ Ready
├── .gitignore                  ✅ Ready
├── README.md                   ✅ Ready
├── setup.md                    ✅ Ready
├── prisma/
│   └── schema.prisma           ✅ Ready
└── src/
    ├── app/
    │   └── api/
    │       ├── webhooks/
    │       │   ├── telegram/
    │       │   │   ├── onboard/
    │       │   │   │   └── route.ts     ✅ Ready
    │       │   │   ├── sales/
    │       │   │   │   └── route.ts     ✅ Ready
    │       │   │   └── finance/
    │       │   │       └── route.ts     ✅ Ready
    │       │   ├── whatsapp/
    │       │   │   └── [service]/
    │       │   │       └── route.ts     ✅ Ready
    │       │   └── sms/
    │       │       └── [service]/
    │       │           └── route.ts     ✅ Ready
    │       ├── users/
    │       │   └── route.ts             ✅ Ready
    │       └── health/
    │           └── route.ts             ✅ Ready
    └── lib/
        ├── ai/
        │   ├── providers/
        │   │   ├── base.ts              ✅ Ready
        │   │   ├── openai.ts            ✅ Ready
        │   │   ├── claude.ts            ✅ Ready
        │   │   └── factory.ts           ✅ Ready
        │   ├── prompts/
        │   │   ├── onboarding.ts        ✅ Ready
        │   │   ├── sales.ts             ✅ Ready
        │   │   └── finance.ts           ✅ Ready
        │   └── types.ts                 ✅ Ready
        ├── messaging/
        │   ├── providers/
        │   │   ├── base.ts              ✅ Ready
        │   │   ├── telegram.ts          ✅ Ready
        │   │   ├── whatsapp.ts          ✅ Ready
        │   │   └── sms.ts               ✅ Ready
        │   ├── factory.ts               ✅ Ready
        │   └── types.ts                 ✅ Ready
        ├── database/
        │   └── client.ts                ✅ Ready
        ├── services/
        │   ├── user.service.ts          ✅ Ready
        │   ├── onboarding.service.ts    ✅ Ready
        │   ├── sales.service.ts         ✅ Ready
        │   ├── finance.service.ts       ✅ Ready
        │   └── message-router.service.ts ✅ Ready
        └── types/
            ├── user.ts                  ✅ Ready
            ├── sales.ts                 ✅ Ready
            └── finance.ts               ✅ Ready
```

## What You Have Now

🎯 **Complete AI Personal Assistant System:**

### ✅ User Management & Onboarding
- Onboarding bot to choose services
- User database with service tracking
- Multi-platform user identification

### ✅ Sales Management
- Lead tracking with full pipeline
- Intelligent follow-up suggestions
- Status progression automation
- Strategic timing recommendations

### ✅ Finance Management  
- Babylon wealth principles integration
- Expense tracking and categorization
- Savings rate monitoring
- Investment guidance

### ✅ Multi-Platform Support
- **Telegram**: 3 bots (onboard, sales, finance)
- **WhatsApp**: Business API integration
- **SMS**: Twilio integration
- Easy to add more platforms

### ✅ AI Integration
- Swappable providers (OpenAI/Claude)
- Custom prompts for each service
- Intelligent parsing and suggestions
- Context-aware responses

### ✅ Database & API
- SQLite database with Prisma ORM
- User isolation and data security
- RESTful API endpoints
- Health monitoring

### ✅ Production Ready
- Environment configuration
- Error handling and logging
- Webhook verification
- Deployment guides

## Quick Start Commands

```bash
# 1. Download and setup
git clone <your-repo>
cd ai-personal-assistant
npm install

# 2. Configure environment
cp .env.example .env.local
# Add your API keys

# 3. Setup database
npm run setup

# 4. Run locally
npm run dev

# 5. Create Telegram bots (@BotFather)
# 6. Set webhook URLs
# 7. Start using!
```

## Usage Flow

1. **User texts onboarding bot**: "Hi"
2. **Bot responds**: "Choose services: sales, finance, or both?"
3. **User**: "both"
4. **System**: Activates both services for user
5. **User texts sales bot**: "New lead Mike +27821234567"
6. **AI**: Creates lead, suggests next steps
7. **User texts finance bot**: "Earned R15000, saved R1500"
8. **AI**: Records transaction, gives Babylon wisdom

This is a **complete, production-ready system** you can download and run immediately! 🚀