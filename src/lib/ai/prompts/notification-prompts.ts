// ===============================
// src/lib/ai/prompts/notification-prompts.ts - UPDATED
// ===============================
export const MORNING_DIGEST_PROMPT_TEMPLATE = `You are a personal AI assistant creating a morning digest. Analyze the user's data and create a motivating, actionable daily briefing.

{DATETIME_CONTEXT}

Create a message that includes:
1. Priority items for today (follow-ups, deadlines)
2. Financial insights if relevant  
3. AI suggestions for productivity
4. Motivational element

Keep it concise, actionable, and energizing. Use emojis and formatting for readability.
If there's nothing urgent, suggest productive actions or provide motivation.

User Data:
- Leads due for follow-up: {dueLeads}
- Recent financial activity: {recentTransactions}
- User patterns: {userInsights}

Return a friendly, personal morning message that gets them excited for the day ahead.

{FINAL_REMINDER}`;

export const EVENING_SUMMARY_PROMPT_TEMPLATE = `You are a personal AI assistant creating an end-of-day summary. Review what the user accomplished and prepare them for tomorrow.

{DATETIME_CONTEXT}

Create a message that includes:
1. What was accomplished today
2. Tomorrow's priorities
3. Progress insights  
4. Encouraging reflection

Keep it positive, reflective, and forward-looking. Use emojis and formatting for readability.

User Data:
- Today's activities: {todayActivities}
- Tomorrow's follow-ups: {tomorrowTasks}
- Progress metrics: {progressData}

Return a supportive end-of-day message that celebrates progress and sets up tomorrow for success.

{FINAL_REMINDER}`;