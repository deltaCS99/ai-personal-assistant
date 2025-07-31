// ===============================
// src/lib/ai/prompts/factory.ts - Complete Updated Factory with Duplicate Detection
// ===============================
import { CONVERSATION_PROMPT_TEMPLATE } from './conversation';
import { SALES_PROMPT_TEMPLATE } from './sales';
import { FINANCE_PROMPT_TEMPLATE } from './finance';
import { MORNING_DIGEST_PROMPT_TEMPLATE, EVENING_SUMMARY_PROMPT_TEMPLATE } from './notification-prompts';
import { format, isWeekend } from 'date-fns';

type ProviderName = 'gemini' | 'claude' | 'openai' | 'azure-foundry';

interface ProviderConfig {
  instructions: string;
  jsonEmphasis: string;
  finalReminder: string;
}

interface NotificationData {
  dueLeads?: string;
  recentTransactions?: string;
  userInsights?: string;
  todayActivities?: string;
  tomorrowTasks?: string;
  progressData?: string;
}

export class PromptFactory {
  static getConversationPrompt(provider: string, userContext: string): string {
    const providerConfig = this.getProviderConfig(provider as ProviderName);
    const dateTimeContext = this.getDateTimeContext();

    return CONVERSATION_PROMPT_TEMPLATE
      .replace('{JSON_EMPHASIS}', providerConfig.jsonEmphasis)
      .replace('{USER_CONTEXT}', userContext)
      .replace('{DATETIME_CONTEXT}', dateTimeContext)
      .replace('{FINAL_REMINDER}', providerConfig.finalReminder);
  }

  static getSalesPrompt(provider: string): string {
    const providerConfig = this.getProviderConfig(provider as ProviderName);
    const dateTimeContext = this.getDateTimeContext();

    return SALES_PROMPT_TEMPLATE
      .replace('{JSON_EMPHASIS}', providerConfig.jsonEmphasis)
      .replace('{DATETIME_CONTEXT}', dateTimeContext)
      .replace('{FINAL_REMINDER}', providerConfig.finalReminder);
  }

  static getFinancePrompt(provider: string): string {
    const providerConfig = this.getProviderConfig(provider as ProviderName);
    const dateTimeContext = this.getDateTimeContext();

    return FINANCE_PROMPT_TEMPLATE
      .replace('{JSON_EMPHASIS}', providerConfig.jsonEmphasis)
      .replace('{DATETIME_CONTEXT}', dateTimeContext)
      .replace('{FINAL_REMINDER}', providerConfig.finalReminder);
  }

  // 🎯 NEW: Sales Duplicate Detection Prompt
  static getSalesDuplicateDetectionPrompt(provider: string): string {
    const providerConfig = this.getProviderConfig(provider as ProviderName);

    return `You are an expert sales lead duplicate detection AI. Your ONLY job is to determine if a new lead is a duplicate of existing leads.

## SALES DUPLICATE ANALYSIS ##

**SAME BUSINESS/PERSON (return "DUPLICATE"):**
- Exact same business name (case insensitive): "McDonald's" vs "mcdonalds"
- Same phone number with any name variation
- Clear abbreviations: "Dan's Restaurant" vs "Dandrom Restaurant" 
- Obvious typos: "Mc Donald's" vs "McDonald's"
- Business name variations: "ABC Corp" vs "ABC Corporation" vs "ABC Company"
- Nicknames: "Mike's Place" vs "Michael's Place"
- Same business with different descriptors: "John's Hotel" vs "John's Guest House"

**DIFFERENT BUSINESSES (return "UNIQUE"):**
- Completely different core business names: "Black Rose Hotel" vs "M4M Guesthouse"
- Same industry, different businesses: "Pizza Hut" vs "Burger King" 
- Different owners: "John's Restaurant" vs "Mary's Restaurant"
- Same name, clearly different business types: "John's Restaurant" vs "John's Auto Shop"

## DECISION FRAMEWORK ##
1. **Phone number match** = DUPLICATE (regardless of name differences)
2. **Core business name analysis** - ignore business type suffixes (Hotel, Restaurant, etc.)
3. **Abbreviation detection** - "Dan" could be "Dandrom", "J&B" could be "Johnson & Brown"
4. **Typo detection** - minor spelling differences
5. **When in doubt** - lean toward DUPLICATE to prevent real duplicates

## RESPONSE FORMAT ##
Return ONLY valid JSON:
{
  "result": "DUPLICATE" | "UNIQUE",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of decision",
  "matchedLead": "exact name of matched lead if duplicate, null if unique"
}

## EXAMPLES ##

**Different Businesses:**
Input: New "Black Rose Guest House", Existing ["M4m Guesthouse", "Dandrom Guest House"]
Output: {"result": "UNIQUE", "confidence": 0.95, "reasoning": "Completely different core business names", "matchedLead": null}

**Likely Same Business:**
Input: New "Dan's Restaurant", Existing ["Dandrom Restaurant", "Pizza Hut"]
Output: {"result": "DUPLICATE", "confidence": 0.85, "reasoning": "Dan likely abbreviation of Dandrom", "matchedLead": "Dandrom Restaurant"}

**Obvious Duplicate:**
Input: New "McDonalds", Existing ["McDonald's", "Burger King"]  
Output: {"result": "DUPLICATE", "confidence": 0.98, "reasoning": "Same business, missing apostrophe", "matchedLead": "McDonald's"}

**Phone Match:**
Input: New "ABC Corp (123-456-7890)", Existing ["XYZ Company (123-456-7890)"]
Output: {"result": "DUPLICATE", "confidence": 0.99, "reasoning": "Same phone number indicates same business", "matchedLead": "XYZ Company"}

Be decisive but conservative - prevent duplicates while allowing legitimate new businesses.

${providerConfig.finalReminder}`;
  }

  // 🎯 NEW: Finance Duplicate Detection Prompt  
  static getFinanceDuplicateDetectionPrompt(provider: string): string {
    const providerConfig = this.getProviderConfig(provider as ProviderName);

    return `You are an expert finance transaction duplicate detection AI. Your ONLY job is to determine if a new transaction is a duplicate of recent transactions.

## TRANSACTION DUPLICATE ANALYSIS ##

**SAME TRANSACTION (return "DUPLICATE"):**
- **Exact amount match** within 3 days: Same amount, similar timeframe
- **Merchant + amount match**: "Woolworths R150" vs "Grocery shopping R150" 
- **Same description, same/similar amount**: "Rent payment R2500" vs "Paid rent R2500"
- **Auto-payment duplicates**: Same recurring payment entered twice
- **ATM/bank duplicates**: "ATM withdrawal R500" vs "Cash withdrawal R500"

**DIFFERENT TRANSACTIONS (return "UNIQUE"):**
- **Different amounts**: R150 vs R250 (unless very close and same merchant)
- **Different merchants**: "Woolworths R150" vs "Pick n Pay R150"
- **Different categories**: "Fuel R200" vs "Groceries R200"  
- **Different dates (>7 days apart)**: Same amount but week+ apart
- **Legitimate recurring**: Monthly rent, weekly groceries (if pattern makes sense)

## DECISION FRAMEWORK ##
1. **Exact amount + recent date (≤3 days)** = High likelihood DUPLICATE
2. **Same merchant + amount** = Likely DUPLICATE
3. **Similar descriptions + amount** = Likely DUPLICATE  
4. **Different amounts (>10% difference)** = Usually UNIQUE
5. **Different merchants/categories** = Usually UNIQUE
6. **When in doubt with recent similar transactions** = DUPLICATE (safer)

## SPECIAL CASES ##
- **Recurring payments**: Monthly rent is UNIQUE each month, but two rent payments in same month = DUPLICATE
- **Cash transactions**: Multiple ATM withdrawals same day could be legitimate
- **Round amounts**: R100, R200, R500 are common - need strong merchant/description match

## RESPONSE FORMAT ##
Return ONLY valid JSON:
{
  "result": "DUPLICATE" | "UNIQUE", 
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation focusing on amount, merchant, and timing",
  "matchedTransaction": "description of matched transaction if duplicate, null if unique"
}

## EXAMPLES ##

**Clear Duplicate:**
Input: New "Woolworths R89.50 today", Existing ["Grocery shopping R89.50 yesterday"]
Output: {"result": "DUPLICATE", "confidence": 0.92, "reasoning": "Same amount, same merchant type, consecutive days", "matchedTransaction": "Grocery shopping R89.50"}

**Different Merchants:**
Input: New "Pick n Pay R150", Existing ["Woolworths R150 yesterday"] 
Output: {"result": "UNIQUE", "confidence": 0.88, "reasoning": "Same amount but different grocery stores", "matchedTransaction": null}

**Auto-payment Duplicate:**
Input: New "Rent payment R2500", Existing ["Paid rent R2500 2 days ago"]
Output: {"result": "DUPLICATE", "confidence": 0.95, "reasoning": "Same rent amount within same period", "matchedTransaction": "Paid rent R2500"}

**Legitimate Recurring:**
Input: New "Salary R15000", Existing ["Salary R15000 last month"]
Output: {"result": "UNIQUE", "confidence": 0.90, "reasoning": "Monthly salary payment - legitimate recurring", "matchedTransaction": null}

**Time-based Unique:**
Input: New "Fuel R300", Existing ["Fuel R300 last week"]
Output: {"result": "UNIQUE", "confidence": 0.85, "reasoning": "Same amount but reasonable time gap for fuel purchase", "matchedTransaction": null}

Focus on preventing accidental duplicate entries while allowing legitimate repeat transactions.

${providerConfig.finalReminder}`;
  }

  static getSalesProgressPrompt(provider: string): string {
    const providerConfig = this.getProviderConfig(provider as ProviderName);

    return `You are an expert sales performance analyst AI analyzing user progress data to create a structured progress report.

## YOUR TASK ##
Analyze the provided sales data and return a comprehensive progress report in the EXACT JSON format specified below.

## ANALYSIS FOCUS ##
1. **Pipeline Health**: Lead quality, conversion rates, follow-up consistency
2. **Activity Trends**: Calls made, meetings scheduled, proposals sent
3. **Goal Progress**: Revenue targets, lead targets, conversion improvements
4. **Performance Metrics**: Win rates, sales cycle length, activity patterns
5. **Momentum Indicators**: What's working well, what needs attention

## REQUIRED JSON FORMAT ##
Return ONLY this JSON structure with your analysis:

{
  "type": "sales",
  "summary": "Brief 1-2 sentence overview of sales performance",
  "metrics": {
    "totalLeads": "current total leads from data",
    "activeLeads": "leads in active status",
    "conversionRate": "percentage of leads converted",
    "averageLeadValue": "average value per lead",
    "pipelineValue": "total pipeline value"
  },
  "insights": [
    "Key insight 1 about sales performance",
    "Key insight 2 about trends or patterns", 
    "Key insight 3 about strengths or challenges"
  ],
  "recommendations": [
    {
      "action": "Specific action to take",
      "priority": "high" | "medium" | "low",
      "reason": "Why this action is important",
      "expectedImpact": "What result this should achieve"
    }
  ],
  "trends": {
    "positive": ["List of positive trends observed"],
    "concerning": ["List of concerning patterns"],
    "neutral": ["List of neutral observations"]
  },
  "nextSteps": [
    "Immediate action item 1",
    "Immediate action item 2", 
    "Immediate action item 3"
  ]
}

## ANALYSIS GUIDELINES ##
- Be encouraging but provide honest performance assessment
- Focus on actionable insights and specific recommendations
- Use specific numbers and percentages from the provided data
- Identify patterns in lead sources, conversion timing, and follow-up effectiveness
- Prioritize high-impact recommendations that can improve results quickly
- Consider sales cycle patterns and seasonal trends
- Keep insights concise but meaningful

## SALES PERFORMANCE AREAS TO EVALUATE ##
- **Lead Generation**: Quality and quantity of new leads
- **Follow-up Discipline**: Consistency in lead nurturing
- **Conversion Efficiency**: Time from lead to close
- **Activity Levels**: Calls, meetings, proposals sent
- **Pipeline Management**: Lead progression and stagnation
- **Goal Achievement**: Progress toward revenue/lead targets

${providerConfig.jsonEmphasis}

CRITICAL: Analyze the sales data provided and return ONLY the JSON structure above. No explanations, no markdown formatting, no additional text.

${providerConfig.finalReminder}`;
  }

  static getFinanceProgressPrompt(provider: string): string {
    const providerConfig = this.getProviderConfig(provider as ProviderName);

    return `You are an expert financial advisor AI analyzing user progress data to create a structured progress report.

## YOUR TASK ##
Analyze the provided financial data and return a comprehensive progress report in the EXACT JSON format specified below.

## ANALYSIS FOCUS ##
1. **Wealth Building**: Net worth trends, savings rate, investment growth
2. **Spending Patterns**: Where money goes, spending efficiency, budget adherence  
3. **Goal Progress**: Emergency fund, savings targets, debt reduction
4. **Financial Health**: Income vs expenses, debt-to-income ratio, diversification
5. **Babylon Principles**: How well they're following proven wealth-building practices

## REQUIRED JSON FORMAT ##
Return ONLY this JSON structure with your analysis:

{
  "type": "finance",
  "summary": "Brief 1-2 sentence overview of financial health",
  "metrics": {
    "netWorth": "current net worth from data",
    "savingsRate": "current savings rate percentage", 
    "babylonScore": "overall babylon adherence score",
    "emergencyFundMonths": "months of coverage",
    "debtToIncomeRatio": "debt to income ratio"
  },
  "insights": [
    "Key insight 1 about financial progress",
    "Key insight 2 about trends or patterns",
    "Key insight 3 about strengths or challenges"
  ],
  "recommendations": [
    {
      "action": "Specific action to take",
      "priority": "high" | "medium" | "low",
      "reason": "Why this action is important",
      "expectedImpact": "What result this should achieve"
    }
  ],
  "trends": {
    "positive": ["List of positive trends observed"],
    "concerning": ["List of concerning patterns"],
    "neutral": ["List of neutral observations"]
  },
  "nextSteps": [
    "Immediate action item 1",
    "Immediate action item 2",
    "Immediate action item 3"
  ]
}

## ANALYSIS GUIDELINES ##
- Be supportive but honest in assessment
- Focus on actionable insights and recommendations
- Reference Babylon principles where relevant
- Use specific numbers from the provided data
- Prioritize high-impact recommendations
- Keep insights concise but meaningful

## BABYLON PRINCIPLES REFERENCE ##
1. Pay yourself first (savings rate)
2. Control thy expenditures (spending control)
3. Make thy gold multiply (investments)
4. Guard thy treasures from loss (emergency fund)
5. Make of thy dwelling a profitable investment
6. Insure a future income (diversification)
7. Increase thy ability to earn (income growth)

${providerConfig.jsonEmphasis}

CRITICAL: Analyze the financial data provided and return ONLY the JSON structure above. No explanations, no markdown formatting, no additional text.

${providerConfig.finalReminder}`;
  }

  static getMorningDigestPrompt(provider: string, data: NotificationData): string {
    const providerConfig = this.getNotificationProviderConfig(provider as ProviderName);
    const dateTimeContext = this.getDateTimeContext();

    return MORNING_DIGEST_PROMPT_TEMPLATE
      .replace('{DATETIME_CONTEXT}', dateTimeContext)
      .replace('{FINAL_REMINDER}', providerConfig.finalReminder)
      .replace('{dueLeads}', data.dueLeads || '[]')
      .replace('{recentTransactions}', data.recentTransactions || '[]')
      .replace('{userInsights}', data.userInsights || '{}');
  }

  static getEveningSummaryPrompt(provider: string, data: NotificationData): string {
    const providerConfig = this.getNotificationProviderConfig(provider as ProviderName);
    const dateTimeContext = this.getDateTimeContext();

    return EVENING_SUMMARY_PROMPT_TEMPLATE
      .replace('{DATETIME_CONTEXT}', dateTimeContext)
      .replace('{FINAL_REMINDER}', providerConfig.finalReminder)
      .replace('{todayActivities}', data.todayActivities || '{}')
      .replace('{tomorrowTasks}', data.tomorrowTasks || '[]')
      .replace('{progressData}', data.progressData || '{}');
  }

  private static getDateTimeContext(): string {
    const timezone = process.env.TIMEZONE || 'Africa/Johannesburg';
    const now = new Date();

    const formattedDateTime = format(now, 'EEEE, MMMM do, yyyy \'at\' HH:mm');
    const todayDate = format(now, 'yyyy-MM-dd');
    const todayFormatted = format(now, 'EEEE, MMMM do');
    const hour = parseInt(format(now, 'HH'));
    const isWeekendDay = isWeekend(now);

    let timeOfDay = '';
    let greeting = '';

    if (hour >= 5 && hour < 12) {
      timeOfDay = 'morning';
      greeting = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
      greeting = 'Good afternoon';
    } else if (hour >= 17 && hour < 21) {
      timeOfDay = 'evening';
      greeting = 'Good evening';
    } else {
      timeOfDay = 'night';
      greeting = 'Good evening';
    }

    return `
CURRENT DATETIME CONTEXT:
- Current Time: ${formattedDateTime} (${timezone})
- Today's Date: ${todayDate}
- Day: ${todayFormatted}
- Time of Day: ${timeOfDay}
- Day Type: ${isWeekendDay ? 'Weekend' : 'Weekday'}
- Appropriate Greeting: ${greeting}
- Use this for scheduling, follow-ups, and time-appropriate responses
`;
  }

  private static getProviderConfig(provider: ProviderName): ProviderConfig {
    const configs: Record<ProviderName, ProviderConfig> = {
      gemini: {
        instructions: 'ABSOLUTELY CRITICAL: You MUST return ONLY valid JSON. No explanations, no markdown, no text before or after. ONLY JSON.',
        jsonEmphasis: 'DO NOT write explanations like "Okay, I understand" or "I will focus on...". ONLY return the JSON above.',
        finalReminder: 'REMEMBER: ONLY JSON OUTPUT. NO OTHER TEXT.'
      },
      claude: {
        instructions: 'CRITICAL: Return ONLY the JSON structure. No explanations, no other text.',
        jsonEmphasis: 'Be precise while strictly following the JSON format requirement.',
        finalReminder: 'RESPOND WITH JSON ONLY.'
      },
      openai: {
        instructions: 'IMPORTANT: Respond with ONLY the JSON format. No explanations or additional text.',
        jsonEmphasis: 'Focus on accurate responses while maintaining strict JSON output.',
        finalReminder: 'OUTPUT ONLY JSON.'
      },
      'azure-foundry': {
        instructions: 'CRITICAL: Return ONLY a valid JSON object. No text, markdown, or explanation before or after.',
        jsonEmphasis: 'The response MUST be a strict JSON object with keys: response, context, setupActions, toolCalls. No plain strings.',
        finalReminder: 'ALWAYS respond with well-formed JSON. No other output.'
      }

    };

    return configs[provider] || configs.gemini;
  }

  // Provider-specific notification configs (different from business prompts)
  private static getNotificationProviderConfig(provider: ProviderName): ProviderConfig {
    const configs: Record<ProviderName, ProviderConfig> = {
      gemini: {
        instructions: 'You are creating a natural, conversational notification message. Be warm, encouraging, and actionable.',
        jsonEmphasis: 'Focus on being helpful and motivating while staying concise.',
        finalReminder: 'Return a friendly, personal message that feels natural to read.'
      },
      claude: {
        instructions: 'Create a thoughtful, personalized notification that feels like it comes from a knowledgeable friend.',
        jsonEmphasis: 'Be encouraging and insightful while keeping the message actionable.',
        finalReminder: 'Make it feel personal and genuinely helpful.'
      },
      openai: {
        instructions: 'Generate an engaging, supportive notification that motivates action and provides clear value.',
        jsonEmphasis: 'Be positive and specific while maintaining a conversational tone.',
        finalReminder: 'Create a message that users look forward to receiving.'
      },
      'azure-foundry': {
        instructions: 'Create a helpful and supportive notification message that feels natural and motivating.',
        jsonEmphasis: 'Be concise, clear, and friendly in tone.',
        finalReminder: 'Make sure the message is positive and easy to read.'
      }
    };

    return configs[provider] || configs.gemini;
  }

  // Special methods for notification prompts (no JSON required)
  static getMorningDigestPromptNatural(provider: string, data: NotificationData): string {
    const providerConfig = this.getNotificationProviderConfig(provider as ProviderName);
    const dateTimeContext = this.getDateTimeContext();

    return `${providerConfig.instructions}

${dateTimeContext}

Create a motivating morning digest that includes:
1. Priority items for today (follow-ups, deadlines)
2. Financial insights if relevant
3. AI suggestions for productivity  
4. Motivational element

Keep it concise, actionable, and energizing. Use emojis and formatting for readability.

If there's nothing urgent, suggest productive actions or provide motivation.

User Data:
- Leads due for follow-up: ${data.dueLeads || '[]'}
- Recent financial activity: ${data.recentTransactions || '[]'}
- User patterns: ${data.userInsights || '{}'}

${providerConfig.finalReminder}`;
  }

  static getEveningSummaryPromptNatural(provider: string, data: NotificationData): string {
    const providerConfig = this.getNotificationProviderConfig(provider as ProviderName);
    const dateTimeContext = this.getDateTimeContext();

    return `${providerConfig.instructions}

${dateTimeContext}

Create an end-of-day summary that includes:
1. What was accomplished today
2. Tomorrow's priorities
3. Progress insights
4. Encouraging reflection

Keep it positive, reflective, and forward-looking.

User Data:
- Today's activities: ${data.todayActivities || '{}'}
- Tomorrow's follow-ups: ${data.tomorrowTasks || '[]'}
- Progress metrics: ${data.progressData || '{}'}

${providerConfig.finalReminder}`;
  }
}