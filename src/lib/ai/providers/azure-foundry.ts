// ===============================
// src/lib/ai/providers/azure-foundry.ts
// ===============================
import { BaseAIProvider } from './base';
import { AzureOpenAI } from 'openai';

export class AzureFoundryProvider extends BaseAIProvider {
  name = 'azure-foundry';
  private readonly client: AzureOpenAI;
  private readonly deploymentName: string;
  private readonly modelName: string;

  constructor(apiKey: string, deploymentName?: string) {
    super();
    const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT!;
    const apiVersion = process.env.AZURE_FOUNDRY_API_VERSION || '2024-04-01-preview';

    this.deploymentName = deploymentName || 'gpt-4o-mini';
    this.modelName = this.deploymentName; // modelName usually matches deployment
    this.client = new AzureOpenAI({
      apiKey,
      endpoint,
      deployment: this.deploymentName,
      apiVersion
    });
  }

  async generateResponse(prompt: string, userMessage: string): Promise<string> {
    try {
      const systemPrompt = this.formatSystemMessage(prompt);
      const userPrompt = this.formatUserMessage(userMessage);

      const response = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: this.modelName,
        max_tokens: 2000,
        temperature: 0.7,
        top_p: 0.95
      });

      return response.choices[0].message?.content ?? '';
    } catch (error) {
      this.handleError(error);
    }
  }
}
