// AI Tools - File operations, shell execution, web search, deployment
import { ToolDefinition, ToolResult } from "./providers";
import { spawn, exec } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// Tool definitions for the AI
export const toolDefinitions: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at the specified path within the project directory.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The relative path to the file within the project directory",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at the specified path within the project directory. Creates the file if it doesn't exist, or overwrites if it does.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The relative path to the file within the project directory",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List all files and directories in the specified path within the project directory.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The relative path to the directory within the project directory. Use '.' for the root project directory.",
        },
        recursive: {
          type: "boolean",
          description: "Whether to list subdirectories recursively (default: false)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "create_directory",
    description: "Create a directory at the specified path within the project directory.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The relative path for the new directory within the project directory",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file or directory at the specified path within the project directory.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The relative path to the file or directory to delete",
        },
        recursive: {
          type: "boolean",
          description: "For directories, whether to delete recursively (default: false)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "move_file",
    description: "Move or rename a file or directory within the project directory.",
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "The relative path of the source file or directory",
        },
        destination: {
          type: "string",
          description: "The relative path for the destination",
        },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "execute_shell",
    description: "Execute a shell command within the project directory. Use this for running scripts, installing packages, starting servers, building projects, etc.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        background: {
          type: "boolean",
          description: "Whether to run the command in the background (default: false). Use for long-running processes like servers.",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default: 30000). Ignored for background processes.",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "web_search",
    description: "Search the web for information. Use this to find documentation, solutions, API references, or any current information.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_system_info",
    description: "Get information about the system environment including OS, disk space, memory, installed runtimes, etc.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "install_package",
    description: "Install packages using the appropriate package manager (npm, pip, cargo, etc.)",
    parameters: {
      type: "object",
      properties: {
        manager: {
          type: "string",
          description: "The package manager to use",
          enum: ["npm", "pip", "pip3", "cargo", "go", "apt", "brew"],
        },
        packages: {
          type: "string",
          description: "Space-separated list of packages to install",
        },
        dev: {
          type: "boolean",
          description: "Install as dev dependency (for npm)",
        },
      },
      required: ["manager", "packages"],
    },
  },
  {
    name: "git_operation",
    description: "Perform git operations within the project directory.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "The git operation to perform",
          enum: ["init", "status", "add", "commit", "push", "pull", "clone", "branch", "checkout", "log", "diff"],
        },
        args: {
          type: "string",
          description: "Additional arguments for the git command",
        },
      },
      required: ["operation"],
    },
  },
  {
    name: "deploy",
    description: "Deploy the project. Supports various deployment targets.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "The deployment target",
          enum: ["docker", "systemd", "pm2", "nginx", "custom"],
        },
        config: {
          type: "string",
          description: "JSON configuration for the deployment",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "manage_process",
    description: "Manage running processes within the project.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "The action to perform",
          enum: ["list", "kill", "restart"],
        },
        pid: {
          type: "number",
          description: "Process ID (required for kill/restart)",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "set_env_variable",
    description: "Set an environment variable for the project.",
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The environment variable name",
        },
        value: {
          type: "string",
          description: "The value to set",
        },
        persist: {
          type: "boolean",
          description: "Whether to persist in .env file (default: true)",
        },
      },
      required: ["key", "value"],
    },
  },
];

// Tool executor
export class ToolExecutor {
  private projectDir: string;
  private envVars: Record<string, string>;
  private backgroundProcesses: Map<number, { command: string; pid: number }> = new Map();

  constructor(projectDir: string, envVars: Record<string, string> = {}) {
    this.projectDir = projectDir;
    this.envVars = envVars;
  }

  private resolvePath(relativePath: string): string {
    const resolved = path.resolve(this.projectDir, relativePath);
    // Security: Ensure path is within project directory
    if (!resolved.startsWith(this.projectDir)) {
      throw new Error("Path traversal not allowed");
    }
    return resolved;
  }

  async execute(toolName: string, args: Record<string, any>): Promise<ToolResult> {
    try {
      let result: string;

      switch (toolName) {
        case "read_file":
          result = await this.readFile(args.path);
          break;
        case "write_file":
          result = await this.writeFile(args.path, args.content);
          break;
        case "list_directory":
          result = await this.listDirectory(args.path, args.recursive);
          break;
        case "create_directory":
          result = await this.createDirectory(args.path);
          break;
        case "delete_file":
          result = await this.deleteFile(args.path, args.recursive);
          break;
        case "move_file":
          result = await this.moveFile(args.source, args.destination);
          break;
        case "execute_shell":
          result = await this.executeShell(args.command, args.background, args.timeout);
          break;
        case "web_search":
          result = await this.webSearch(args.query);
          break;
        case "get_system_info":
          result = await this.getSystemInfo();
          break;
        case "install_package":
          result = await this.installPackage(args.manager, args.packages, args.dev);
          break;
        case "git_operation":
          result = await this.gitOperation(args.operation, args.args);
          break;
        case "deploy":
          result = await this.deploy(args.target, args.config);
          break;
        case "manage_process":
          result = await this.manageProcess(args.action, args.pid);
          break;
        case "set_env_variable":
          result = await this.setEnvVariable(args.key, args.value, args.persist);
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      return { toolCallId: toolName, result };
    } catch (error: any) {
      return { toolCallId: toolName, result: `Error: ${error.message}`, isError: true };
    }
  }

  private async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    const content = await fs.readFile(fullPath, "utf-8");
    return content;
  }

  private async writeFile(filePath: string, content: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    return `Successfully wrote ${content.length} characters to ${filePath}`;
  }

  private async listDirectory(dirPath: string, recursive?: boolean): Promise<string> {
    const fullPath = this.resolvePath(dirPath);
    
    async function listRecursive(dir: string, prefix: string = ""): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const results: string[] = [];

      for (const entry of entries) {
        const entryPath = path.join(prefix, entry.name);
        if (entry.isDirectory()) {
          results.push(`📁 ${entryPath}/`);
          if (recursive) {
            const subResults = await listRecursive(path.join(dir, entry.name), entryPath);
            results.push(...subResults);
          }
        } else {
          const stats = await fs.stat(path.join(dir, entry.name));
          const size = stats.size < 1024 ? `${stats.size}B` : 
                       stats.size < 1048576 ? `${(stats.size / 1024).toFixed(1)}KB` :
                       `${(stats.size / 1048576).toFixed(1)}MB`;
          results.push(`📄 ${entryPath} (${size})`);
        }
      }

      return results;
    }

    const entries = await listRecursive(fullPath);
    return entries.length > 0 ? entries.join("\n") : "Directory is empty";
  }

  private async createDirectory(dirPath: string): Promise<string> {
    const fullPath = this.resolvePath(dirPath);
    await fs.mkdir(fullPath, { recursive: true });
    return `Created directory: ${dirPath}`;
  }

  private async deleteFile(filePath: string, recursive?: boolean): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    const stats = await fs.stat(fullPath);
    
    if (stats.isDirectory()) {
      await fs.rm(fullPath, { recursive: recursive || false });
      return `Deleted directory: ${filePath}`;
    } else {
      await fs.unlink(fullPath);
      return `Deleted file: ${filePath}`;
    }
  }

  private async moveFile(source: string, destination: string): Promise<string> {
    const sourcePath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.rename(sourcePath, destPath);
    return `Moved ${source} to ${destination}`;
  }

  private executeShell(command: string, background?: boolean, timeout?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        cwd: this.projectDir,
        env: { ...process.env, ...this.envVars },
        timeout: background ? undefined : (timeout || 30000),
        maxBuffer: 10 * 1024 * 1024, // 10MB
      };

      if (background) {
        const child = spawn(command, [], {
          ...options,
          shell: true,
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        this.backgroundProcesses.set(child.pid!, { command, pid: child.pid! });
        resolve(`Started background process with PID: ${child.pid}`);
      } else {
        exec(command, options, (error, stdout, stderr) => {
          if (error && error.killed) {
            reject(new Error(`Command timed out after ${timeout || 30000}ms`));
            return;
          }

          let output = "";
          if (stdout) output += stdout;
          if (stderr) output += (output ? "\n" : "") + stderr;
          
          if (error && !stdout && !stderr) {
            reject(error);
          } else {
            resolve(output || "Command completed successfully");
          }
        });
      }
    });
  }

  private async webSearch(query: string): Promise<string> {
    // Use DuckDuckGo HTML search (no API key required)
    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AIStudio/1.0)",
        },
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const html = await response.text();
      
      // Extract search results from HTML
      const results: string[] = [];
      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/gi;
      
      let match;
      let count = 0;
      while ((match = resultRegex.exec(html)) && count < 5) {
        const url = match[1];
        const title = match[2].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
        results.push(`${count + 1}. ${title}\n   ${url}`);
        count++;
      }

      if (results.length === 0) {
        return "No search results found. Try rephrasing your query.";
      }

      return `Search results for "${query}":\n\n${results.join("\n\n")}`;
    } catch (error: any) {
      return `Search error: ${error.message}. Try using execute_shell with curl for direct API access.`;
    }
  }

  private async getSystemInfo(): Promise<string> {
    const info: string[] = [];

    // OS Info
    info.push(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
    info.push(`Hostname: ${os.hostname()}`);
    info.push(`Platform: ${os.platform()}`);

    // Memory
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    info.push(`Memory: ${(usedMem / 1024 / 1024 / 1024).toFixed(1)}GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(1)}GB`);

    // Disk space (for project directory)
    try {
      const result = await this.executeShell(`df -h "${this.projectDir}" | tail -1`);
      const parts = result.split(/\s+/);
      if (parts.length >= 4) {
        info.push(`Disk: ${parts[2]} used / ${parts[1]} total (${parts[4]} used)`);
      }
    } catch (e) {
      info.push("Disk: Unable to determine");
    }

    // CPU
    info.push(`CPUs: ${os.cpus().length} x ${os.cpus()[0]?.model || "Unknown"}`);

    // Runtime versions
    const runtimes = [
      { name: "Node.js", cmd: "node --version" },
      { name: "npm", cmd: "npm --version" },
      { name: "Python", cmd: "python3 --version || python --version" },
      { name: "pip", cmd: "pip3 --version || pip --version" },
      { name: "Go", cmd: "go version" },
      { name: "Rust/Cargo", cmd: "cargo --version" },
      { name: "Docker", cmd: "docker --version" },
      { name: "Git", cmd: "git --version" },
    ];

    info.push("\nInstalled Runtimes:");
    for (const rt of runtimes) {
      try {
        const version = await this.executeShell(rt.cmd);
        info.push(`  ${rt.name}: ${version.trim().split("\n")[0]}`);
      } catch (e) {
        // Not installed
      }
    }

    // Project directory
    info.push(`\nProject Directory: ${this.projectDir}`);

    return info.join("\n");
  }

  private async installPackage(manager: string, packages: string, dev?: boolean): Promise<string> {
    let command: string;

    switch (manager) {
      case "npm":
        command = `npm install ${dev ? "--save-dev" : ""} ${packages}`;
        break;
      case "pip":
      case "pip3":
        command = `${manager} install ${packages}`;
        break;
      case "cargo":
        command = `cargo add ${packages}`;
        break;
      case "go":
        command = `go get ${packages}`;
        break;
      case "apt":
        command = `sudo apt-get install -y ${packages}`;
        break;
      case "brew":
        command = `brew install ${packages}`;
        break;
      default:
        throw new Error(`Unknown package manager: ${manager}`);
    }

    return this.executeShell(command, false, 120000); // 2 minute timeout for installs
  }

  private async gitOperation(operation: string, args?: string): Promise<string> {
    const gitArgs = args ? ` ${args}` : "";
    const command = `git ${operation}${gitArgs}`;
    return this.executeShell(command);
  }

  private async deploy(target: string, configJson?: string): Promise<string> {
    const config = configJson ? JSON.parse(configJson) : {};

    switch (target) {
      case "docker":
        return this.deployDocker(config);
      case "systemd":
        return this.deploySystemd(config);
      case "pm2":
        return this.deployPm2(config);
      case "nginx":
        return this.deployNginx(config);
      case "custom":
        if (!config.command) {
          throw new Error("Custom deployment requires a 'command' in config");
        }
        return this.executeShell(config.command);
      default:
        throw new Error(`Unknown deployment target: ${target}`);
    }
  }

  private async deployDocker(config: any): Promise<string> {
    const results: string[] = [];

    // Check for Dockerfile
    try {
      await fs.access(path.join(this.projectDir, "Dockerfile"));
    } catch {
      // Create a default Dockerfile if none exists
      const dockerfile = `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]`;
      await this.writeFile("Dockerfile", dockerfile);
      results.push("Created default Dockerfile");
    }

    const imageName = config.imageName || "app";
    const containerName = config.containerName || "app-container";
    const port = config.port || 3000;

    // Build image
    results.push(await this.executeShell(`docker build -t ${imageName} .`, false, 300000));

    // Stop existing container if running
    try {
      await this.executeShell(`docker stop ${containerName}`);
      await this.executeShell(`docker rm ${containerName}`);
    } catch {
      // Container might not exist
    }

    // Run new container
    results.push(await this.executeShell(
      `docker run -d --name ${containerName} -p ${port}:${port} ${imageName}`
    ));

    return results.join("\n\n");
  }

  private async deploySystemd(config: any): Promise<string> {
    const serviceName = config.serviceName || "app";
    const command = config.command || "npm start";
    const workingDir = this.projectDir;

    const serviceFile = `[Unit]
Description=${serviceName} service
After=network.target

[Service]
Type=simple
User=${os.userInfo().username}
WorkingDirectory=${workingDir}
ExecStart=/bin/bash -c "${command}"
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target`;

    const servicePath = `/etc/systemd/system/${serviceName}.service`;
    
    // Write service file
    await this.executeShell(`echo '${serviceFile}' | sudo tee ${servicePath}`);
    
    // Reload and start
    await this.executeShell("sudo systemctl daemon-reload");
    await this.executeShell(`sudo systemctl enable ${serviceName}`);
    await this.executeShell(`sudo systemctl restart ${serviceName}`);

    return `Deployed as systemd service: ${serviceName}\nStatus: ${await this.executeShell(`systemctl status ${serviceName} --no-pager`)}`;
  }

  private async deployPm2(config: any): Promise<string> {
    const appName = config.appName || "app";
    const script = config.script || "npm start";

    // Install pm2 if not installed
    try {
      await this.executeShell("pm2 --version");
    } catch {
      await this.executeShell("npm install -g pm2");
    }

    // Stop existing app if running
    try {
      await this.executeShell(`pm2 delete ${appName}`);
    } catch {
      // App might not exist
    }

    // Start app with pm2
    const startResult = await this.executeShell(`pm2 start "${script}" --name ${appName}`);
    
    // Save pm2 config
    await this.executeShell("pm2 save");

    return `${startResult}\n\n${await this.executeShell("pm2 status")}`;
  }

  private async deployNginx(config: any): Promise<string> {
    const domain = config.domain || "localhost";
    const port = config.port || 3000;

    const nginxConfig = `server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}`;

    const configPath = `/etc/nginx/sites-available/${domain}`;
    const enabledPath = `/etc/nginx/sites-enabled/${domain}`;

    await this.executeShell(`echo '${nginxConfig}' | sudo tee ${configPath}`);
    await this.executeShell(`sudo ln -sf ${configPath} ${enabledPath}`);
    await this.executeShell("sudo nginx -t");
    await this.executeShell("sudo systemctl reload nginx");

    return `Nginx configured for ${domain} -> localhost:${port}`;
  }

  private async manageProcess(action: string, pid?: number): Promise<string> {
    switch (action) {
      case "list":
        const processes = Array.from(this.backgroundProcesses.entries())
          .map(([pid, info]) => `PID ${pid}: ${info.command}`)
          .join("\n");
        return processes || "No background processes running";
      
      case "kill":
        if (!pid) throw new Error("PID required for kill action");
        try {
          process.kill(pid);
          this.backgroundProcesses.delete(pid);
          return `Killed process ${pid}`;
        } catch (e: any) {
          throw new Error(`Failed to kill process ${pid}: ${e.message}`);
        }
      
      case "restart":
        if (!pid) throw new Error("PID required for restart action");
        const info = this.backgroundProcesses.get(pid);
        if (!info) throw new Error(`Process ${pid} not found`);
        
        try {
          process.kill(pid);
          this.backgroundProcesses.delete(pid);
        } catch {
          // Process might already be dead
        }
        
        return this.executeShell(info.command, true);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async setEnvVariable(key: string, value: string, persist?: boolean): Promise<string> {
    this.envVars[key] = value;

    if (persist !== false) {
      const envPath = path.join(this.projectDir, ".env");
      let envContent = "";
      
      try {
        envContent = await fs.readFile(envPath, "utf-8");
      } catch {
        // File doesn't exist
      }

      // Update or add the variable
      const regex = new RegExp(`^${key}=.*$`, "m");
      const newLine = `${key}=${value}`;
      
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, newLine);
      } else {
        envContent = envContent.trim() + (envContent ? "\n" : "") + newLine + "\n";
      }

      await fs.writeFile(envPath, envContent);
      return `Set ${key} and saved to .env`;
    }

    return `Set ${key} (session only)`;
  }
}
