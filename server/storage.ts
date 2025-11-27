import { 
  projects, type Project, type InsertProject,
  chats, type Chat, type InsertChat,
  messages, type Message, type InsertMessage,
  executions, type Execution, type InsertExecution,
  files, type File, type InsertFile,
  envVars, type EnvVar, type InsertEnvVar,
  settings, type Setting, type InsertSetting,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

// Base directory for all projects
const PROJECTS_BASE_DIR = process.env.PROJECTS_DIR || "/tmp/aistudio/projects";

export interface IStorage {
  // Projects
  createProject(project: InsertProject): Promise<Project>;
  getProject(id: string): Promise<Project | undefined>;
  getProjects(): Promise<Project[]>;
  updateProject(id: string, data: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  // Chats
  createChat(chat: InsertChat): Promise<Chat>;
  getChat(id: string): Promise<Chat | undefined>;
  getChatsByProject(projectId: string): Promise<Chat[]>;
  updateChat(id: string, data: Partial<Chat>): Promise<Chat | undefined>;
  deleteChat(id: string): Promise<boolean>;

  // Messages
  createMessage(message: InsertMessage): Promise<Message>;
  getMessage(id: string): Promise<Message | undefined>;
  getMessagesByChat(chatId: string): Promise<Message[]>;
  deleteMessage(id: string): Promise<boolean>;

  // Executions
  createExecution(execution: InsertExecution): Promise<Execution>;
  getExecution(id: string): Promise<Execution | undefined>;
  getExecutionsByProject(projectId: string): Promise<Execution[]>;
  updateExecution(id: string, data: Partial<Execution>): Promise<Execution | undefined>;

  // Files
  createFile(file: InsertFile): Promise<File>;
  getFilesByProject(projectId: string): Promise<File[]>;
  deleteFile(id: string): Promise<boolean>;
  syncProjectFiles(projectId: string): Promise<File[]>;

  // Environment Variables
  createEnvVar(envVar: InsertEnvVar): Promise<EnvVar>;
  getEnvVarsByProject(projectId: string): Promise<EnvVar[]>;
  updateEnvVar(id: string, data: Partial<EnvVar>): Promise<EnvVar | undefined>;
  deleteEnvVar(id: string): Promise<boolean>;

  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: any): Promise<Setting>;

  // File system operations
  getProjectDirectory(projectId: string): string;
  ensureProjectDirectory(projectId: string): Promise<string>;
}

export class DatabaseStorage implements IStorage {
  
  // Projects
  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const directoryPath = path.join(PROJECTS_BASE_DIR, id);
    
    // Ensure project directory exists
    await fs.mkdir(directoryPath, { recursive: true });
    
    const [project] = await db.insert(projects).values({
      ...insertProject,
      id,
      directoryPath,
    }).returning();
    
    return project;
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.updatedAt));
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project | undefined> {
    const [project] = await db.update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  async updateProjectApiKey(id: string, apiKey: string): Promise<Project | undefined> {
    const [project] = await db.update(projects)
      .set({ apiKey, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  async deleteProject(id: string): Promise<boolean> {
    const project = await this.getProject(id);
    if (project) {
      // Delete project directory
      try {
        await fs.rm(project.directoryPath, { recursive: true, force: true });
      } catch (e) {
        console.error("Failed to delete project directory:", e);
      }
    }
    const result = await db.delete(projects).where(eq(projects.id, id));
    return true;
  }

  // Chats
  async createChat(insertChat: InsertChat): Promise<Chat> {
    const [chat] = await db.insert(chats).values(insertChat).returning();
    return chat;
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, id));
    return chat;
  }

  async getChatsByProject(projectId: string): Promise<Chat[]> {
    return db.select().from(chats)
      .where(eq(chats.projectId, projectId))
      .orderBy(desc(chats.updatedAt));
  }

  async updateChat(id: string, data: Partial<Chat>): Promise<Chat | undefined> {
    const [chat] = await db.update(chats)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(chats.id, id))
      .returning();
    return chat;
  }

  async deleteChat(id: string): Promise<boolean> {
    await db.delete(chats).where(eq(chats.id, id));
    return true;
  }

  // Messages
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(insertMessage).returning();
    
    // Update chat's updatedAt
    await db.update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, insertMessage.chatId));
    
    return message;
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message;
  }

  async getMessagesByChat(chatId: string): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(messages.createdAt);
  }

  async deleteMessage(id: string): Promise<boolean> {
    await db.delete(messages).where(eq(messages.id, id));
    return true;
  }

  // Executions
  async createExecution(insertExecution: InsertExecution): Promise<Execution> {
    const [execution] = await db.insert(executions).values(insertExecution).returning();
    return execution;
  }

  async getExecution(id: string): Promise<Execution | undefined> {
    const [execution] = await db.select().from(executions).where(eq(executions.id, id));
    return execution;
  }

  async getExecutionsByProject(projectId: string): Promise<Execution[]> {
    return db.select().from(executions)
      .where(eq(executions.projectId, projectId))
      .orderBy(desc(executions.startedAt));
  }

  async updateExecution(id: string, data: Partial<Execution>): Promise<Execution | undefined> {
    const [execution] = await db.update(executions)
      .set(data)
      .where(eq(executions.id, id))
      .returning();
    return execution;
  }

  // Files
  async createFile(insertFile: InsertFile): Promise<File> {
    const [file] = await db.insert(files).values(insertFile).returning();
    return file;
  }

  async getFilesByProject(projectId: string): Promise<File[]> {
    return db.select().from(files)
      .where(eq(files.projectId, projectId))
      .orderBy(files.path);
  }

  async deleteFile(id: string): Promise<boolean> {
    await db.delete(files).where(eq(files.id, id));
    return true;
  }

  async syncProjectFiles(projectId: string): Promise<File[]> {
    const project = await this.getProject(projectId);
    if (!project) return [];

    // Delete existing file records
    await db.delete(files).where(eq(files.projectId, projectId));

    // Scan directory and create new records
    const fileList: InsertFile[] = [];
    
    async function scanDir(dirPath: string, basePath: string) {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(basePath, fullPath);
          
          if (entry.isDirectory()) {
            fileList.push({
              projectId,
              path: relativePath,
              type: "directory",
              size: 0,
            });
            await scanDir(fullPath, basePath);
          } else {
            const stats = await fs.stat(fullPath);
            fileList.push({
              projectId,
              path: relativePath,
              type: "file",
              size: stats.size,
            });
          }
        }
      } catch (e) {
        console.error("Error scanning directory:", e);
      }
    }

    await scanDir(project.directoryPath, project.directoryPath);

    if (fileList.length > 0) {
      await db.insert(files).values(fileList);
    }

    return this.getFilesByProject(projectId);
  }

  // Environment Variables
  async createEnvVar(insertEnvVar: InsertEnvVar): Promise<EnvVar> {
    const [envVar] = await db.insert(envVars).values(insertEnvVar).returning();
    return envVar;
  }

  async getEnvVarsByProject(projectId: string): Promise<EnvVar[]> {
    return db.select().from(envVars)
      .where(eq(envVars.projectId, projectId))
      .orderBy(envVars.key);
  }

  async updateEnvVar(id: string, data: Partial<EnvVar>): Promise<EnvVar | undefined> {
    const [envVar] = await db.update(envVars)
      .set(data)
      .where(eq(envVars.id, id))
      .returning();
    return envVar;
  }

  async deleteEnvVar(id: string): Promise<boolean> {
    await db.delete(envVars).where(eq(envVars.id, id));
    return true;
  }

  // Settings
  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }

  async setSetting(key: string, value: any): Promise<Setting> {
    const existing = await this.getSetting(key);
    if (existing) {
      const [setting] = await db.update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key))
        .returning();
      return setting;
    }
    const [setting] = await db.insert(settings).values({ key, value }).returning();
    return setting;
  }

  // File system helpers
  getProjectDirectory(projectId: string): string {
    return path.join(PROJECTS_BASE_DIR, projectId);
  }

  async ensureProjectDirectory(projectId: string): Promise<string> {
    const dir = this.getProjectDirectory(projectId);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }
}

export const storage = new DatabaseStorage();
