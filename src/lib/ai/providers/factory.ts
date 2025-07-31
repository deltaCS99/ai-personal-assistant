// ===============================
// src/lib/ai/providers/factory.ts
// ===============================
import { AIProvider, AIConfig } from '../types';
import { OpenAIProvider } from './openai';
import { ClaudeProvider } from './claude';
import { GeminiProvider } from './gemini';
import { AzureFoundryProvider } from './azure-foundry';

export class AIProviderFactory {
  static create(config: AIConfig): AIProvider {
    const { provider, model } = config;

    switch (provider) {
      case 'openai': {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) throw new Error('OPENAI_API_KEY not found');
        return new OpenAIProvider(openaiKey, model);
      }

      case 'claude': {
        const claudeKey = process.env.ANTHROPIC_API_KEY;
        if (!claudeKey) throw new Error('ANTHROPIC_API_KEY not found');
        return new ClaudeProvider(claudeKey, model);
      }

      case 'gemini': {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) throw new Error('GEMINI_API_KEY not found');
        return new GeminiProvider(geminiKey);
      }      
      
      case 'azure-foundry': {
        const azureKey = process.env.AZURE_FOUNDRY_API_KEY;
        const azureEndpoint = process.env.AZURE_FOUNDRY_ENDPOINT;
        if (!azureKey) throw new Error('AZURE_FOUNDRY_API_KEY not found');
        if (!azureEndpoint) throw new Error('AZURE_FOUNDRY_ENDPOINT not found');
        return new AzureFoundryProvider(azureKey, model);
      }

      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  static createFromEnv(): AIProvider {
    const provider = (process.env.AI_PROVIDER as AIConfig['provider']) || 'openai';
    return this.create({ provider });
  }

    static createContextDetectionProvider(): AIProvider {
    const provider = (process.env.CONTEXT_DETECTION_PROVIDER as AIConfig['provider']) || 
                     (process.env.AI_PROVIDER as AIConfig['provider']) || 
                     'azure-foundry';
    const model = process.env.CONTEXT_DETECTION_MODEL || 'gpt-4o-mini';
    return this.create({ provider, model });
  }
}
