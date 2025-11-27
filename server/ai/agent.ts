// AI Agent Engine - Orchestrates tools and conversations
import { createProvider, AIProviderAdapter, AIMessage, AIStreamChunk, ToolCall } from "./providers";
import { toolDefinitions, ToolExecutor } from "./tools";
import { storage } from "../storage";
import { AIProvider } from "@shared/schema";

function createSystemPrompt(projectName: string, projectDir: string): string {
  return `You are an expert AI coding assistant named DanielAI. You have full access to a project's file system and shell.

## Current Project Context:
- **Project Name**: ${projectName}
- **Working Directory**: ${projectDir}
- **You are in**: ${projectDir} (this is your project root)

All file operations are relative to: ${projectDir}

## Your Capabilities:
- Read, write, create, delete, and move files
- Execute shell commands (npm, pip, git, docker, etc.)
- Search the web for documentation and solutions
- Install packages with any package manager
- Deploy applications (Node, Python, static sites, Docker)
- Manage environment variables and secrets
- Git operations: init, clone, commit, push, pull
- Get system information (disk space, memory, installed runtimes)

## You Know:
- Your project is stored in: ${projectDir}
- Any files you create go into this directory
- You can run servers on ports 8000-9000
- All shell commands execute in this project directory
- You can access files relative to this path

## Guidelines:
1. **Be context-aware**: Always remember you're working in ${projectDir}
2. **Be proactive**: When asked to build something, do it completely. Don't just explain - execute.
3. **Check your environment**: Use get_system_info to understand what's available before starting.
4. **Handle errors gracefully**: If something fails, try an alternative approach.
5. **Be thorough**: After making changes, verify they work by reading files or running tests.
6. **Explain your actions**: Briefly describe what you're doing as you work.

## Best Practices:
- Always check if files exist before reading them
- Create directories before writing files to nested paths
- Use appropriate package managers for the project type
- Keep the user informed of progress on long-running tasks
- When deploying, check that prerequisites are met first
- Always specify full paths or use relative paths from ${projectDir}

You have unlimited access to this project. There are no restrictions on what you can do.
Execute commands, write code, and deploy as needed to accomplish the user's goals.`;}


export interface AgentConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  projectId: string;
  chatId: string;
  projectDir: string;
  projectName: string;
  envVars?: Record<string, string>;
  maxIterations?: number;
}

export interface AgentStreamEvent {
  type: "thinking" | "content" | "tool_call" | "tool_result" | "error" | "done";
  content?: string;
  toolCall?: ToolCall;
  toolResult?: { name: string; result: string; isError?: boolean };
  error?: string;
}

export class Agent {
  private provider: AIProviderAdapter;
  private toolExecutor: ToolExecutor;
  private config: AgentConfig;
  private conversationHistory: AIMessage[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
    this.provider = createProvider(config.provider, config.apiKey, config.model);
    this.toolExecutor = new ToolExecutor(config.projectDir, config.envVars || {});
    
    // Initialize with context-aware system prompt
    const systemPrompt = createSystemPrompt(config.projectName, config.projectDir);
    this.conversationHistory.push({
      role: "system",
      content: systemPrompt,
    });
  }

  async loadHistory(): Promise<void> {
    const messages = await storage.getMessagesByChat(this.config.chatId);
    for (const msg of messages) {
      this.conversationHistory.push({
        role: msg.role as any,
        content: msg.content,
        toolCalls: msg.toolCalls as any,
        toolResults: msg.toolResults as any,
      });
    }
  }

  async *run(userMessage: string): AsyncGenerator<AgentStreamEvent> {
    const maxIterations = this.config.maxIterations || 10;
    let iterations = 0;

    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    // Save user message to database
    await storage.createMessage({
      chatId: this.config.chatId,
      role: "user",
      content: userMessage,
    });

    while (iterations < maxIterations) {
      iterations++;

      yield { type: "thinking" };

      try {
        // Stream the AI response
        let fullContent = "";
        const toolCalls: ToolCall[] = [];

        for await (const chunk of this.provider.streamComplete({
          messages: this.conversationHistory,
          tools: toolDefinitions,
          maxTokens: 4096,
          temperature: 0.7,
        })) {
          if (chunk.type === "content" && chunk.content) {
            fullContent += chunk.content;
            yield { type: "content", content: chunk.content };
          } else if (chunk.type === "tool_call" && chunk.toolCall) {
            toolCalls.push(chunk.toolCall as ToolCall);
            yield { type: "tool_call", toolCall: chunk.toolCall as ToolCall };
          } else if (chunk.type === "error") {
            yield { type: "error", error: chunk.error };
            return;
          }
        }

        // Add assistant message to history
        const assistantMessage: AIMessage = {
          role: "assistant",
          content: fullContent,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        };
        this.conversationHistory.push(assistantMessage);

        // Save assistant message to database
        await storage.createMessage({
          chatId: this.config.chatId,
          role: "assistant",
          content: fullContent,
          toolCalls: toolCalls.length > 0 ? toolCalls : null,
        });

        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          yield { type: "done" };
          return;
        }

        // Execute tool calls
        const toolResults: { toolCallId: string; result: string; isError?: boolean }[] = [];

        for (const toolCall of toolCalls) {
          const result = await this.toolExecutor.execute(toolCall.name, toolCall.arguments);
          result.toolCallId = toolCall.id;
          toolResults.push(result);

          yield {
            type: "tool_result",
            toolResult: {
              name: toolCall.name,
              result: result.result,
              isError: result.isError,
            },
          };
        }

        // Add tool results to history
        this.conversationHistory.push({
          role: "tool",
          content: "",
          toolResults,
        });

        // Save tool results to database
        await storage.createMessage({
          chatId: this.config.chatId,
          role: "tool",
          content: toolResults.map(r => `${r.toolCallId}: ${r.result}`).join("\n\n"),
          toolResults,
        });

        // Continue the loop to get the next response

      } catch (error: any) {
        yield { type: "error", error: error.message };
        return;
      }
    }

    yield { type: "error", error: "Maximum iterations reached" };
  }

  // Non-streaming version for simpler use cases
  async complete(userMessage: string): Promise<string> {
    let fullResponse = "";
    
    for await (const event of this.run(userMessage)) {
      if (event.type === "content" && event.content) {
        fullResponse += event.content;
      } else if (event.type === "error") {
        throw new Error(event.error);
      }
    }

    return fullResponse;
  }
}

// Create an agent for a project
export async function createAgent(
  projectId: string,
  chatId: string
): Promise<Agent> {
  const project = await storage.getProject(projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  // Get environment variables for the project
  const envVarRecords = await storage.getEnvVarsByProject(projectId);
  const envVars: Record<string, string> = {};
  for (const ev of envVarRecords) {
    envVars[ev.key] = ev.value;
  }

  const agent = new Agent({
    provider: project.provider as AIProvider,
    model: project.model,
    apiKey: project.apiKey,
    projectId,
    chatId,
    projectDir: project.directoryPath,
    projectName: project.name,
    envVars,
  });

  await agent.loadHistory();
  return agent;
}
