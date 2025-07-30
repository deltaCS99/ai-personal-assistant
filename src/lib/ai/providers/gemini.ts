// ===============================
// src/lib/ai/providers/gemini.ts - Google Gemini Provider
// ===============================
import { BaseAIProvider } from './base';

export class GeminiProvider extends BaseAIProvider {
  name = 'Google Gemini';
  private readonly apiKey: string;
  private readonly endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generateResponse(prompt: string, userMessage: string): Promise<string> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-goog-api-key': this.apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: this.formatSystemMessage(prompt) },
                { text: this.formatUserMessage(userMessage) }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();

      const candidates = data.candidates;
      if (!candidates || !candidates[0]?.content?.parts) {
        throw new Error('Invalid response format from Gemini API');
      }

      return candidates[0].content.parts.map((part: any) => part.text).join('');
    } catch (error) {
      this.handleError(error);
    }
  }
}
