import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { createAgent } from "./ai/agent";
import { aiModels, insertProjectSchema, insertChatSchema, insertEnvVarSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============ PROJECTS ============
  
  // Get all projects
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getProjects();
      // Don't send API keys to frontend
      const sanitized = projects.map(p => ({ ...p, apiKey: "***" }));
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get single project
  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json({ ...project, apiKey: "***" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create project
  app.post("/api/projects", async (req, res) => {
    try {
      const data = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(data);
      
      // Create default chat
      await storage.createChat({
        projectId: project.id,
        title: "Main Chat",
      });
      
      res.json({ ...project, apiKey: "***" });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Update project
  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json({ ...project, apiKey: "***" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update project API key
  app.patch("/api/projects/:id/api-key", async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey) {
        return res.status(400).json({ error: "API key is required" });
      }
      const project = await storage.updateProjectApiKey(req.params.id, apiKey);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json({ ...project, apiKey: "***" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete project
  app.delete("/api/projects/:id", async (req, res) => {
    try {
      await storage.deleteProject(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ CHATS ============

  // Get chats for project
  app.get("/api/projects/:projectId/chats", async (req, res) => {
    try {
      const chats = await storage.getChatsByProject(req.params.projectId);
      res.json(chats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create chat
  app.post("/api/projects/:projectId/chats", async (req, res) => {
    try {
      const chat = await storage.createChat({
        projectId: req.params.projectId,
        title: req.body.title || "New Chat",
      });
      res.json(chat);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update chat
  app.patch("/api/chats/:id", async (req, res) => {
    try {
      const chat = await storage.updateChat(req.params.id, req.body);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }
      res.json(chat);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete chat
  app.delete("/api/chats/:id", async (req, res) => {
    try {
      await storage.deleteChat(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ MESSAGES ============

  // Get messages for chat
  app.get("/api/chats/:chatId/messages", async (req, res) => {
    try {
      const messages = await storage.getMessagesByChat(req.params.chatId);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ FILES ============

  // Get files for project
  app.get("/api/projects/:projectId/files", async (req, res) => {
    try {
      const files = await storage.syncProjectFiles(req.params.projectId);
      res.json(files);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Read file content
  app.get("/api/projects/:projectId/files/content", async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: "Path required" });
      }
      
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const fs = await import("fs/promises");
      const path = await import("path");
      const fullPath = path.join(project.directoryPath, filePath);
      
      // Security check
      if (!fullPath.startsWith(project.directoryPath)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const content = await fs.readFile(fullPath, "utf-8");
      res.json({ content });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Write file content
  app.put("/api/projects/:projectId/files/content", async (req, res) => {
    try {
      const { path: filePath, content } = req.body;
      if (!filePath) {
        return res.status(400).json({ error: "Path required" });
      }

      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const fs = await import("fs/promises");
      const path = await import("path");
      const fullPath = path.join(project.directoryPath, filePath);

      // Security check
      if (!fullPath.startsWith(project.directoryPath)) {
        return res.status(403).json({ error: "Access denied" });
      }

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf-8");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ ENVIRONMENT VARIABLES ============

  // Get env vars for project
  app.get("/api/projects/:projectId/env", async (req, res) => {
    try {
      const envVars = await storage.getEnvVarsByProject(req.params.projectId);
      // Mask secret values
      const masked = envVars.map(ev => ({
        ...ev,
        value: ev.isSecret ? "***" : ev.value,
      }));
      res.json(masked);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create env var
  app.post("/api/projects/:projectId/env", async (req, res) => {
    try {
      const data = insertEnvVarSchema.parse({
        ...req.body,
        projectId: req.params.projectId,
      });
      const envVar = await storage.createEnvVar(data);
      res.json(envVar.isSecret ? { ...envVar, value: "***" } : envVar);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update env var
  app.patch("/api/env/:id", async (req, res) => {
    try {
      const envVar = await storage.updateEnvVar(req.params.id, req.body);
      if (!envVar) {
        return res.status(404).json({ error: "Environment variable not found" });
      }
      res.json(envVar.isSecret ? { ...envVar, value: "***" } : envVar);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete env var
  app.delete("/api/env/:id", async (req, res) => {
    try {
      await storage.deleteEnvVar(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ EXECUTIONS ============

  // Get executions for project
  app.get("/api/projects/:projectId/executions", async (req, res) => {
    try {
      const executions = await storage.getExecutionsByProject(req.params.projectId);
      res.json(executions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ AI MODELS ============

  // Get available models
  app.get("/api/models", (req, res) => {
    res.json(aiModels);
  });

  // ============ WEBSOCKET FOR CHAT ============

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    let currentProjectId: string | null = null;
    let currentChatId: string | null = null;

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "join": {
            currentProjectId = message.projectId;
            currentChatId = message.chatId;
            ws.send(JSON.stringify({ type: "joined", projectId: currentProjectId, chatId: currentChatId }));
            break;
          }

          case "message": {
            if (!currentProjectId || !currentChatId) {
              ws.send(JSON.stringify({ type: "error", error: "Not joined to a chat" }));
              return;
            }

            const userMessage = message.content;
            
            try {
              const agent = await createAgent(currentProjectId, currentChatId);
              
              for await (const event of agent.run(userMessage)) {
                ws.send(JSON.stringify(event));
              }
            } catch (error: any) {
              ws.send(JSON.stringify({ type: "error", error: error.message }));
            }
            break;
          }

          default:
            ws.send(JSON.stringify({ type: "error", error: `Unknown message type: ${message.type}` }));
        }
      } catch (error: any) {
        ws.send(JSON.stringify({ type: "error", error: error.message }));
      }
    });

    ws.on("close", () => {
      currentProjectId = null;
      currentChatId = null;
    });
  });

  return httpServer;
}
