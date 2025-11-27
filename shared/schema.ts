import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// AI Provider enum
export const aiProviders = ["openai", "anthropic", "google"] as const;
export type AIProvider = typeof aiProviders[number];

// AI Models configuration
export const aiModels = {
  openai: [
    { id: "gpt-4o", name: "GPT-4o", context: 128000 },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", context: 128000 },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", context: 128000 },
    { id: "gpt-4", name: "GPT-4", context: 8192 },
    { id: "o1", name: "o1 (Reasoning)", context: 128000 },
    { id: "o1-mini", name: "o1 Mini", context: 128000 },
    { id: "o1-preview", name: "o1 Preview", context: 128000 },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", context: 16384 },
  ],
  anthropic: [
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", context: 200000 },
    { id: "claude-sonnet-4", name: "Claude Sonnet 4", context: 200000 },
    { id: "claude-opus-4", name: "Claude Opus 4", context: 200000 },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", context: 200000 },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", context: 200000 },
  ],
  google: [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", context: 1000000 },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", context: 1000000 },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", context: 1000000 },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", context: 1000000 },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", context: 1000000 },
  ],
} as const;

// Projects table - each project is an isolated workspace
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  provider: text("provider").notNull(), // openai, anthropic, google
  model: text("model").notNull(), // specific model id
  apiKey: text("api_key").notNull(), // encrypted API key
  directoryPath: text("directory_path").notNull(), // /projects/{id}/
  status: text("status").notNull().default("active"), // active, archived
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  directoryPath: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// Chats/Conversations within a project
export const chats = pgTable("chats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New Chat"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertChatSchema = createInsertSchema(chats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertChat = z.infer<typeof insertChatSchema>;
export type Chat = typeof chats.$inferSelect;

// Messages in a chat
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: varchar("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user, assistant, system, tool
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"), // array of tool calls made
  toolResults: jsonb("tool_results"), // results from tool executions
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Executions - track shell commands, deployments, etc.
export const executions = pgTable("executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id").references(() => chats.id, { onDelete: "set null" }),
  type: text("type").notNull(), // shell, deploy, install, etc.
  command: text("command").notNull(),
  output: text("output"),
  exitCode: integer("exit_code"),
  status: text("status").notNull().default("running"), // running, success, failed
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertExecutionSchema = createInsertSchema(executions).omit({
  id: true,
  output: true,
  exitCode: true,
  status: true,
  startedAt: true,
  completedAt: true,
});

export type InsertExecution = z.infer<typeof insertExecutionSchema>;
export type Execution = typeof executions.$inferSelect;

// File metadata - track files in projects
export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  path: text("path").notNull(), // relative path within project
  type: text("type").notNull(), // file, directory
  size: integer("size"),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

export const insertFileSchema = createInsertSchema(files).omit({
  id: true,
  lastModified: true,
});

export type InsertFile = z.infer<typeof insertFileSchema>;
export type File = typeof files.$inferSelect;

// Environment variables per project
export const envVars = pgTable("env_vars", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(), // encrypted
  isSecret: boolean("is_secret").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEnvVarSchema = createInsertSchema(envVars).omit({
  id: true,
  createdAt: true,
});

export type InsertEnvVar = z.infer<typeof insertEnvVarSchema>;
export type EnvVar = typeof envVars.$inferSelect;

// System settings
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;
