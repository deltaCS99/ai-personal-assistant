// src/lib/utils/json.ts
export function extractJsonPayload(text: string): any {
  const match = text.match(/```json\s*([\s\S]+?)```/) || text.match(/\{[\s\S]+\}/);
  if (!match) throw new Error(`Failed to extract JSON: ${text}`);
  return JSON.parse(match[1] || match[0]);
}
