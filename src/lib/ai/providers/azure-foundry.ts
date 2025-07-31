// ===============================
// src/lib/ai/providers/azure-foundry.ts - FIXED WITH JSON MODE
// ===============================
import { BaseAIProvider } from './base';
import { AzureOpenAI } from 'openai';

export class AzureFoundryProvider extends BaseAIProvider {
  name = 'azure-foundry';
  private readonly client: AzureOpenAI;
  private readonly deploymentName: string;

  constructor(apiKey: string, deploymentName?: string) {
    super();
    const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT!;
    const apiVersion = process.env.AZURE_FOUNDRY_API_VERSION || '2024-04-01-preview';

    this.deploymentName = deploymentName || 'gpt-4o';

    this.client = new AzureOpenAI({
      apiKey,
      endpoint,
      apiVersion,
      deployment: this.deploymentName,
    });
  }

  async generateResponse(prompt: string, userMessage: string): Promise<string> {
    try {
      const systemPrompt = this.formatSystemMessage(prompt);
      const userPrompt = this.formatUserMessage(userMessage);

      const response = await this.client.chat.completions.create({
        model: this.deploymentName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.1,
        top_p: 0.95,
        response_format: { 
          type: "json_object" 
        }
      });

      return response.choices[0].message?.content ?? '';
    } catch (error) {
      this.handleError(error);
    }
  }
}