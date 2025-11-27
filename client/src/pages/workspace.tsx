import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ChevronLeft, Send, Folder, FileText, Plus, Terminal, MessageSquare,
  Settings, Loader2, FolderOpen, ChevronDown, Eye, Code, Copy, X, Play, Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Project {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  model: string;
  directoryPath: string;
}

interface Chat {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  chatId: string;
  role: string;
  content: string;
  toolCalls?: any[];
  toolResults?: any[];
  createdAt: string;
}

interface FileNode {
  id: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

interface AgentEvent {
  type: "thinking" | "content" | "tool_call" | "tool_result" | "error" | "done" | "joined";
  content?: string;
  toolCall?: { id: string; name: string; arguments: any };
  toolResult?: { name: string; result: string; isError?: boolean };
  error?: string;
}

export default function Workspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isFileModified, setIsFileModified] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [terminalOutput, setTerminalOutput] = useState<string>("");
  const [thinkingMessage, setThinkingMessage] = useState("");
  
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: chats = [] } = useQuery<Chat[]>({
    queryKey: ["chats", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/chats`);
      if (!res.ok) throw new Error("Failed to fetch chats");
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ["messages", currentChatId],
    queryFn: async () => {
      const res = await fetch(`/api/chats/${currentChatId}/messages`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!currentChatId,
  });

  const { data: files = [], refetch: refetchFiles } = useQuery<FileNode[]>({
    queryKey: ["files", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
    enabled: !!projectId,
  });

  const createChat = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (!res.ok) throw new Error("Failed to create chat");
      return res.json();
    },
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ["chats", projectId] });
      setCurrentChatId(chat.id);
    },
  });

  useEffect(() => {
    if (chats.length > 0 && !currentChatId) {
      setCurrentChatId(chats[0].id);
    }
  }, [chats, currentChatId]);

  // WebSocket connection
  useEffect(() => {
    if (!projectId || !currentChatId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", projectId, chatId: currentChatId }));
    };

    ws.onmessage = (event) => {
      const data: AgentEvent = JSON.parse(event.data);
      
      switch (data.type) {
        case "thinking":
          setIsStreaming(true);
          setThinkingMessage("Thinking...");
          break;
        case "content":
          setThinkingMessage("");
          setTerminalOutput((prev) => prev + (data.content || ""));
          break;
        case "tool_call":
          if (data.toolCall) {
            setTerminalOutput((prev) => prev + `\n→ Executing: ${data.toolCall?.name}\n`);
          }
          break;
        case "tool_result":
          if (data.toolResult) {
            setTerminalOutput((prev) => prev + `✓ ${data.toolResult?.name}\n${data.toolResult?.result}\n`);
            refetchFiles();
          }
          break;
        case "done":
          setIsStreaming(false);
          setThinkingMessage("");
          refetchMessages();
          setTerminalOutput("");
          setMessageQueue((prev) => prev.slice(1));
          break;
        case "error":
          setIsStreaming(false);
          setThinkingMessage("");
          setTerminalOutput((prev) => prev + `\n✗ Error: ${data.error}\n`);
          break;
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
    };

    return () => {
      ws.close();
    };
  }, [projectId, currentChatId, refetchMessages, refetchFiles]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalOutput, thinkingMessage]);

  const sendMessage = useCallback(() => {
    if (!inputMessage.trim() || !wsRef.current) return;
    
    const msg = inputMessage.trim();
    setMessageQueue((prev) => [...prev, msg]);
    setInputMessage("");
    
    if (!isStreaming) {
      wsRef.current.send(JSON.stringify({
        type: "message",
        content: msg,
      }));
    }
  }, [inputMessage, isStreaming]);

  const loadFile = async (path: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error("Failed to load file");
      const data = await res.json();
      setSelectedFile(path);
      setFileContent(data.content);
      setIsFileModified(false);
    } catch (error) {
      console.error("Error loading file:", error);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    
    try {
      const res = await fetch(`/api/projects/${projectId}/files/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFile, content: fileContent }),
      });
      if (!res.ok) throw new Error("Failed to save file");
      setIsFileModified(false);
      refetchFiles();
    } catch (error) {
      console.error("Error saving file:", error);
    }
  };

  const buildFileTree = (files: FileNode[]) => {
    const tree: Record<string, FileNode[]> = { "": [] };
    for (const file of files) {
      const parts = file.path.split("/");
      if (parts.length === 1) {
        tree[""].push(file);
      } else {
        const parent = parts.slice(0, -1).join("/");
        if (!tree[parent]) tree[parent] = [];
        tree[parent].push(file);
      }
    }
    return tree;
  };

  const fileTree = buildFileTree(files);

  const FileTreeNode = ({ path, depth = 0 }: { path: string; depth?: number }) => {
    const [isOpen, setIsOpen] = useState(depth < 2);
    const children = fileTree[path] || [];
    const directories = children.filter((f) => f.type === "directory");
    const filesInDir = children.filter((f) => f.type === "file");

    return (
      <>
        {directories.map((dir) => (
          <Collapsible key={dir.id} open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 w-full px-2 py-1 hover:bg-white/5 rounded text-sm">
              <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
              <FolderOpen className="h-4 w-4 text-yellow-500" />
              <span className="truncate">{dir.path.split("/").pop()}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-4">
              <FileTreeNode path={dir.path} depth={depth + 1} />
            </CollapsibleContent>
          </Collapsible>
        ))}
        {filesInDir.map((file) => (
          <div
            key={file.id}
            className={`flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded text-sm cursor-pointer ${
              selectedFile === file.path ? "bg-primary/20 text-primary" : ""
            }`}
            onClick={() => loadFile(file.path)}
            data-testid={`file-${file.path}`}
          >
            <FileText className="h-4 w-4 text-blue-400" />
            <span className="truncate">{file.path.split("/").pop()}</span>
          </div>
        ))}
      </>
    );
  };

  const renderMessage = (msg: Message) => {
    const isUser = msg.role === "user";
    return (
      <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[75%] rounded-lg px-4 py-3 ${isUser ? "bg-primary text-primary-foreground" : "bg-card/80 border border-white/5"}`}>
          <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-12 border-b border-white/5 bg-card/50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")} data-testid="button-back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="font-display font-bold text-sm">DANIEL<span className="text-primary">AI</span></span>
          <span className="text-muted-foreground">/</span>
          <h1 className="font-display font-semibold">{project?.name || "Loading..."}</h1>
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-white/5 rounded">{project?.model}</span>
        </div>
        <Button variant="ghost" size="icon" data-testid="button-settings">
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Sidebar - Files */}
          <ResizablePanel defaultSize={18} minSize={12} maxSize={30}>
            <div className="h-full flex flex-col bg-card/30 border-r border-white/5">
              <div className="flex border-b border-white/5 p-2">
                <Folder className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-xs font-medium">Files</span>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2">
                  <FileTreeNode path="" />
                  {files.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-xs">No files</div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Main Area */}
          <ResizablePanel defaultSize={82}>
            <ResizablePanelGroup direction="vertical">
              {/* Top - Preview & Code Editor */}
              <ResizablePanel defaultSize={40} minSize={20}>
                <ResizablePanelGroup direction="horizontal">
                  {/* Preview */}
                  <ResizablePanel defaultSize={50}>
                    <div className="h-full flex flex-col bg-card/20 border-r border-white/5">
                      <div className="h-9 border-b border-white/5 flex items-center px-3 bg-card/50 gap-2">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium">Preview</span>
                      </div>
                      <div className="flex-1 overflow-auto">
                        <iframe
                          src={`http://localhost:5173/`}
                          className="w-full h-full border-0"
                          title="Preview"
                        />
                      </div>
                    </div>
                  </ResizablePanel>

                  <ResizableHandle withHandle />

                  {/* Code Editor */}
                  {selectedFile && (
                    <ResizablePanel defaultSize={50}>
                      <div className="h-full flex flex-col">
                        <div className="h-9 border-b border-white/5 flex items-center justify-between px-3 bg-card/50">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-blue-400 flex-shrink-0" />
                            <span className="text-xs font-mono truncate">{selectedFile}</span>
                            {isFileModified && <span className="h-2 w-2 rounded-full bg-yellow-500 flex-shrink-0" />}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={saveFile}
                            disabled={!isFileModified}
                            className="h-6 w-6"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <textarea
                          value={fileContent}
                          onChange={(e) => {
                            setFileContent(e.target.value);
                            setIsFileModified(true);
                          }}
                          className="flex-1 font-mono text-xs p-3 bg-background/50 border-0 resize-none focus:outline-none focus:ring-0"
                          spellCheck="false"
                          data-testid="editor-content"
                        />
                      </div>
                    </ResizablePanel>
                  )}
                </ResizablePanelGroup>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Bottom - Chat + Terminal */}
              <ResizablePanel defaultSize={60}>
                <ResizablePanelGroup direction="horizontal">
                  {/* Chat */}
                  <ResizablePanel defaultSize={60}>
                    <div className="h-full flex flex-col bg-background">
                      <div className="h-9 border-b border-white/5 flex items-center px-3 bg-card/50">
                        <MessageSquare className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="text-xs font-medium">Chat</span>
                      </div>
                      
                      <ScrollArea className="flex-1 p-3">
                        <div className="space-y-3">
                          {messages.map(renderMessage)}
                          <div ref={messagesEndRef} />
                        </div>
                      </ScrollArea>

                      <div className="border-t border-white/5 p-3 bg-card/30 space-y-2">
                        {messageQueue.length > 0 && (
                          <div className="text-xs text-muted-foreground px-2 py-1 bg-white/5 rounded">
                            Queue: {messageQueue.length} message{messageQueue.length !== 1 ? 's' : ''} waiting
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Input
                            ref={inputRef}
                            value={inputMessage}
                            onChange={(e) => setInputMessage(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                              }
                            }}
                            placeholder="Tell the AI what to build..."
                            disabled={false}
                            className="flex-1 h-9 bg-background/50 border-white/10 text-sm"
                            data-testid="input-message"
                          />
                          <Button
                            onClick={sendMessage}
                            disabled={!inputMessage.trim()}
                            size="sm"
                            data-testid="button-send"
                          >
                            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </ResizablePanel>

                  <ResizableHandle withHandle />

                  {/* Terminal */}
                  <ResizablePanel defaultSize={40}>
                    <div className="h-full flex flex-col bg-background">
                      <div className="h-9 border-b border-white/5 flex items-center justify-between px-3 bg-card/50">
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-medium">Terminal</span>
                        </div>
                        {isStreaming && <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />}
                      </div>
                      
                      <ScrollArea className="flex-1">
                        <div className="font-mono text-xs p-3 text-muted-foreground whitespace-pre-wrap">
                          {terminalOutput}
                          {thinkingMessage && <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />{thinkingMessage}</div>}
                          <div ref={terminalEndRef} />
                        </div>
                      </ScrollArea>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
