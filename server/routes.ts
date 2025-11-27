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

  // Upload file (multipart)
  app.post("/api/projects/:projectId/files/upload", async (req, res) => {
    try {
      const { file, filename } = req.body;
      if (!file || !filename) {
        return res.status(400).json({ error: "File and filename required" });
      }

      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const fs = await import("fs/promises");
      const path = await import("path");
      const fullPath = path.join(project.directoryPath, filename);

      // Security check
      if (!fullPath.startsWith(project.directoryPath)) {
        return res.status(403).json({ error: "Access denied" });
      }

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, Buffer.from(file, "base64"));
      await storage.syncProjectFiles(req.params.projectId);
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

  // ============ FILE OPERATIONS ============

  // Download all project files as ZIP
  app.get("/api/projects/:projectId/download", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const archiver = require("archiver");
      const archive = archiver("zip", { zlib: { level: 9 } });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${project.name}-${Date.now()}.zip"`);

      archive.pipe(res);
      archive.directory(project.directoryPath, project.name);
      await archive.finalize();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Upload ZIP/folder to project
  app.post("/api/projects/:projectId/files/upload-zip", async (req, res) => {
    try {
      const { zipData, filename } = req.body;
      if (!zipData || !filename) {
        return res.status(400).json({ error: "zipData and filename required" });
      }

      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const AdmZip = require("adm-zip");
      const buffer = Buffer.from(zipData, "base64");
      const zip = new AdmZip(buffer);

      // Extract to project directory
      zip.extractAllTo(project.directoryPath, true);

      // Sync files to database
      await storage.syncProjectFiles(project.id);

      res.json({ success: true, message: "Files extracted successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ GITHUB OPERATIONS ============

  // Clone GitHub repo into project
  app.post("/api/projects/:projectId/github/clone", async (req, res) => {
    try {
      const { repoUrl } = req.body;
      if (!repoUrl) {
        return res.status(400).json({ error: "repoUrl required" });
      }
      
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const { execSync } = require("child_process");
      const result = execSync(`cd ${project.directoryPath} && git clone ${repoUrl} .`, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      
      res.json({ success: true, message: "Repository cloned", output: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Initialize git repo
  app.post("/api/projects/:projectId/github/init", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const { execSync } = require("child_process");
      execSync(`cd ${project.directoryPath} && git init && git config user.email "ai@danieldai.com" && git config user.name "DanielAI"`, {
        encoding: "utf-8",
      });
      
      res.json({ success: true, message: "Git repository initialized" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get git status
  app.get("/api/projects/:projectId/github/status", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const { execSync } = require("child_process");
      const status = execSync(`cd ${project.directoryPath} && git status --short`, {
        encoding: "utf-8",
      });
      
      res.json({ status });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ DEPLOYMENT ============

  // One-click deploy - provide domain and it deploys
  app.post("/api/projects/:projectId/deploy-to-domain", async (req, res) => {
    try {
      const { domain } = req.body;
      if (!domain) {
        return res.status(400).json({ error: "domain required (e.g., example.com)" });
      }
      
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Generate complete deployment script
      const deployScript = `#!/bin/bash
set -e

# DanielAI Auto-Deploy for ${project.name}
DOMAIN="${domain}"
PROJECT_NAME="${project.name}"
PROJECT_DIR="${project.directoryPath}"

echo "🚀 Deploying $PROJECT_NAME to $DOMAIN..."

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js if not present
if ! command -v node &> /dev/null; then
  echo "📦 Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs npm
fi

# Install PostgreSQL if not present
if ! command -v psql &> /dev/null; then
  echo "📦 Installing PostgreSQL..."
  sudo apt-get install -y postgresql postgresql-contrib
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
fi

# Build and install
echo "🔨 Building application..."
cd $PROJECT_DIR
npm install --legacy-peer-deps
npm run build 2>/dev/null || echo "No build script"

# Install and start with PM2
echo "🎯 Installing PM2..."
sudo npm install -g pm2

# Start or restart app
pm2 delete "$PROJECT_NAME" 2>/dev/null || true
pm2 start npm --name "$PROJECT_NAME" -- start
pm2 startup
pm2 save

# Install and configure Nginx
echo "🌐 Setting up Nginx..."
sudo apt-get install -y nginx

# Create Nginx config
sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null <<'NGINX_EOF'
upstream app {
    server localhost:5000;
}

server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket support for AI agent
    location /ws {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
NGINX_EOF

# Enable site
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN

# Test Nginx
sudo nginx -t

# Reload Nginx
sudo systemctl enable nginx
sudo systemctl restart nginx

# Setup SSL with Let's Encrypt
echo "🔒 Setting up SSL..."
sudo apt-get install -y certbot python3-certbot-nginx

# Get email for Let's Encrypt
sudo certbot --nginx --non-interactive --agree-tos \\
  -d $DOMAIN -m admin@$DOMAIN \\
  --redirect 2>/dev/null || echo "SSL setup skipped - configure manually if needed"

# Show status
echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo "🌍 Your app is live at: https://$DOMAIN"
echo "📊 App running as: $PROJECT_NAME"
echo ""
echo "Useful commands:"
echo "  pm2 logs $PROJECT_NAME          # View logs"
echo "  pm2 restart $PROJECT_NAME       # Restart"
echo "  pm2 stop $PROJECT_NAME          # Stop"
echo "  sudo systemctl reload nginx     # Reload web server"
`;

      res.json({
        success: true,
        message: "Ready to deploy! Follow instructions:",
        steps: [
          "1. Go to your Ubuntu server",
          "2. Create file: nano deploy.sh",
          "3. Paste the script below",
          "4. Run: chmod +x deploy.sh && ./deploy.sh",
          "5. Wait 2-3 minutes for SSL certificate",
          "6. Visit https://" + domain
        ],
        script: deployScript,
        domain: domain
      });
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
