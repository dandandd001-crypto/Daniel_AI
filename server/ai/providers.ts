// AI Provider Adapters for OpenAI, Anthropic, and Google
import { AIProvider, aiModels } from "@shared/schema";

export interface AIMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  result: string;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface AICompletionRequest {
  messages: AIMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface AICompletionResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIStreamChunk {
  type: "content" | "tool_call" | "done" | "error";
  content?: string;
  toolCall?: Partial<ToolCall>;
  error?: string;
}

export interface AIProviderAdapter {
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
  streamComplete(request: AICompletionRequest): AsyncGenerator<AIStreamChunk>;
}

// OpenAI Provider
export class OpenAIProvider implements AIProviderAdapter {
  private apiKey: string;
  private model: string;
  private baseUrl = "https://api.openai.com/v1";

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  private formatMessages(messages: AIMessage[]): any[] {
    return messages.map(msg => {
      const formatted: any = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        formatted.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }

      if (msg.role === "tool" && msg.toolResults) {
        return msg.toolResults.map(tr => ({
          role: "tool",
          tool_call_id: tr.toolCallId,
          content: tr.result,
        }));
      }

      return formatted;
    }).flat();
  }

  private formatTools(tools: ToolDefinition[]): any[] {
    return tools.map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const isO1Model = this.model.startsWith("o1");
    
    const body: any = {
      model: this.model,
      messages: this.formatMessages(request.messages),
    };

    if (isO1Model) {
      body.max_completion_tokens = request.maxTokens || 4096;
    } else {
      body.max_tokens = request.maxTokens || 4096;
      body.temperature = request.temperature ?? 0.7;
    }

    if (request.tools && request.tools.length > 0 && !isO1Model) {
      body.tools = this.formatTools(request.tools);
      body.tool_choice = "auto";
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const message = choice.message;

    const result: AICompletionResponse = {
      content: message.content || "",
      finishReason: choice.finish_reason === "tool_calls" ? "tool_calls" : 
                    choice.finish_reason === "length" ? "length" : "stop",
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };

    if (message.tool_calls) {
      result.toolCalls = message.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));
    }

    return result;
  }

  async *streamComplete(request: AICompletionRequest): AsyncGenerator<AIStreamChunk> {
    const isO1Model = this.model.startsWith("o1");
    
    const body: any = {
      model: this.model,
      messages: this.formatMessages(request.messages),
      stream: true,
    };

    if (isO1Model) {
      body.max_completion_tokens = request.maxTokens || 4096;
    } else {
      body.max_tokens = request.maxTokens || 4096;
      body.temperature = request.temperature ?? 0.7;
    }

    if (request.tools && request.tools.length > 0 && !isO1Model) {
      body.tools = this.formatTools(request.tools);
      body.tool_choice = "auto";
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      yield { type: "error", error: `OpenAI API error: ${response.status} - ${error}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    const toolCalls: Map<number, Partial<ToolCall>> = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            yield { type: "done" };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta;

            if (delta?.content) {
              yield { type: "content", content: delta.content };
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCalls.get(tc.index) || {};
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) {
                  existing.arguments = (existing.arguments || "") + tc.function.arguments;
                }
                toolCalls.set(tc.index, existing);
              }
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }

    // Emit tool calls at the end
    for (const [, tc] of toolCalls) {
      if (tc.id && tc.name) {
        yield {
          type: "tool_call",
          toolCall: {
            id: tc.id,
            name: tc.name,
            arguments: typeof tc.arguments === "string" ? JSON.parse(tc.arguments) : tc.arguments,
          },
        };
      }
    }

    yield { type: "done" };
  }
}

// Anthropic Provider
export class AnthropicProvider implements AIProviderAdapter {
  private apiKey: string;
  private model: string;
  private baseUrl = "https://api.anthropic.com/v1";

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  private formatMessages(messages: AIMessage[]): { system?: string; messages: any[] } {
    let systemPrompt: string | undefined;
    const formattedMessages: any[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt = (systemPrompt || "") + msg.content + "\n";
        continue;
      }

      if (msg.role === "tool" && msg.toolResults) {
        for (const tr of msg.toolResults) {
          formattedMessages.push({
            role: "user",
            content: [{
              type: "tool_result",
              tool_use_id: tr.toolCallId,
              content: tr.result,
              is_error: tr.isError,
            }],
          });
        }
        continue;
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        formattedMessages.push({
          role: "assistant",
          content: msg.toolCalls.map(tc => ({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          })),
        });
        continue;
      }

      formattedMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }

    return { system: systemPrompt?.trim(), messages: formattedMessages };
  }

  private formatTools(tools: ToolDefinition[]): any[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const { system, messages } = this.formatMessages(request.messages);

    const body: any = {
      model: this.model,
      messages,
      max_tokens: request.maxTokens || 4096,
    };

    if (system) {
      body.system = system;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = this.formatTools(request.tools);
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    let content = "";
    const toolCalls: ToolCall[] = [];

    for (const block of data.content) {
      if (block.type === "text") {
        content += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input,
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: data.stop_reason === "tool_use" ? "tool_calls" : 
                    data.stop_reason === "max_tokens" ? "length" : "stop",
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      } : undefined,
    };
  }

  async *streamComplete(request: AICompletionRequest): AsyncGenerator<AIStreamChunk> {
    const { system, messages } = this.formatMessages(request.messages);

    const body: any = {
      model: this.model,
      messages,
      max_tokens: request.maxTokens || 4096,
      stream: true,
    };

    if (system) {
      body.system = system;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = this.formatTools(request.tools);
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      yield { type: "error", error: `Anthropic API error: ${response.status} - ${error}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let currentToolCall: Partial<ToolCall> | null = null;
    let toolInputBuffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === "content_block_start") {
              if (parsed.content_block.type === "tool_use") {
                currentToolCall = {
                  id: parsed.content_block.id,
                  name: parsed.content_block.name,
                };
                toolInputBuffer = "";
              }
            } else if (parsed.type === "content_block_delta") {
              if (parsed.delta.type === "text_delta") {
                yield { type: "content", content: parsed.delta.text };
              } else if (parsed.delta.type === "input_json_delta") {
                toolInputBuffer += parsed.delta.partial_json;
              }
            } else if (parsed.type === "content_block_stop") {
              if (currentToolCall) {
                try {
                  currentToolCall.arguments = JSON.parse(toolInputBuffer);
                } catch {
                  currentToolCall.arguments = {};
                }
                yield { type: "tool_call", toolCall: currentToolCall };
                currentToolCall = null;
              }
            } else if (parsed.type === "message_stop") {
              yield { type: "done" };
              return;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    yield { type: "done" };
  }
}

// Google Gemini Provider
export class GoogleProvider implements AIProviderAdapter {
  private apiKey: string;
  private model: string;
  private baseUrl = "https://generativelanguage.googleapis.com/v1";

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  private formatMessages(messages: AIMessage[]): { systemInstruction?: any; contents: any[] } {
    let systemInstruction: any;
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction = { parts: [{ text: msg.content }] };
        continue;
      }

      if (msg.role === "tool" && msg.toolResults) {
        contents.push({
          role: "function",
          parts: msg.toolResults.map(tr => ({
            functionResponse: {
              name: tr.toolCallId,
              response: { result: tr.result },
            },
          })),
        });
        continue;
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        contents.push({
          role: "model",
          parts: msg.toolCalls.map(tc => ({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          })),
        });
        continue;
      }

      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    return { systemInstruction, contents };
  }

  private formatTools(tools: ToolDefinition[]): any[] {
    return [{
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    }];
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const { systemInstruction, contents } = this.formatMessages(request.messages);

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = this.formatTools(request.tools);
    }

    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    
    if (!candidate) {
      throw new Error("No response from Google API");
    }

    let content = "";
    const toolCalls: ToolCall[] = [];

    for (const part of candidate.content?.parts || []) {
      if (part.text) {
        content += part.text;
      } else if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.name,
          name: part.functionCall.name,
          arguments: part.functionCall.args,
        });
      }
    }

    const finishReason = candidate.finishReason === "STOP" ? "stop" :
                         candidate.finishReason === "MAX_TOKENS" ? "length" :
                         toolCalls.length > 0 ? "tool_calls" : "stop";

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined,
    };
  }

  async *streamComplete(request: AICompletionRequest): AsyncGenerator<AIStreamChunk> {
    const { systemInstruction, contents } = this.formatMessages(request.messages);

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = this.formatTools(request.tools);
    }

    const url = `${this.baseUrl}/models/${this.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      yield { type: "error", error: `Google API error: ${response.status} - ${error}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            const candidate = parsed.candidates?.[0];
            
            if (candidate?.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.text) {
                  yield { type: "content", content: part.text };
                } else if (part.functionCall) {
                  yield {
                    type: "tool_call",
                    toolCall: {
                      id: part.functionCall.name,
                      name: part.functionCall.name,
                      arguments: part.functionCall.args,
                    },
                  };
                }
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    yield { type: "done" };
  }
}

// Factory function to create the appropriate provider
export function createProvider(provider: AIProvider, apiKey: string, model: string): AIProviderAdapter {
  switch (provider) {
    case "openai":
      return new OpenAIProvider(apiKey, model);
    case "anthropic":
      return new AnthropicProvider(apiKey, model);
    case "google":
      return new GoogleProvider(apiKey, model);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function getAvailableModels(provider: AIProvider) {
  return aiModels[provider] || [];
}
