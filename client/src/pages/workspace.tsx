import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Send, Folder, FileText, Plus,
  Terminal, MessageSquare, Settings, Play, Square, Loader2,
  FolderOpen, ChevronDown, MoreVertical, Trash2, Edit2, Save, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
  
  // UI State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"chat" | "files" | "terminal">("chat");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isFileModified, setIsFileModified] = useState(false);
  
  // Chat State
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingToolCalls, setStreamingToolCalls] = useState<any[]>([]);
  const [streamingToolResults, setStreamingToolResults] = useState<any[]>([]);
  
  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Fetch project
  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: !!projectId,
  });

  // Fetch chats
  const { data: chats = [] } = useQuery<Chat[]>({
    queryKey: ["chats", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/chats`);
      if (!res.ok) throw new Error("Failed to fetch chats");
      return res.json();
    },
    enabled: !!projectId,
  });

  // Fetch messages for current chat
  const { data: messages = [], refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ["messages", currentChatId],
    queryFn: async () => {
      const res = await fetch(`/api/chats/${currentChatId}/messages`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!currentChatId,
  });

  // Fetch files
  const { data: files = [], refetch: refetchFiles } = useQuery<FileNode[]>({
    queryKey: ["files", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
    enabled: !!projectId,
  });

  // Create chat mutation
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

  // Set default chat
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
        case "joined":
          console.log("Joined chat:", data);
          break;
        case "thinking":
          setIsStreaming(true);
          setStreamingContent("");
          setStreamingToolCalls([]);
          setStreamingToolResults([]);
          break;
        case "content":
          setStreamingContent((prev) => prev + (data.content || ""));
          break;
        case "tool_call":
          if (data.toolCall) {
            setStreamingToolCalls((prev) => [...prev, data.toolCall]);
          }
          break;
        case "tool_result":
          if (data.toolResult) {
            setStreamingToolResults((prev) => [...prev, data.toolResult]);
            // Refresh files after tool execution
            refetchFiles();
          }
          break;
        case "done":
          setIsStreaming(false);
          refetchMessages();
          setStreamingContent("");
          setStreamingToolCalls([]);
          setStreamingToolResults([]);
          break;
        case "error":
          setIsStreaming(false);
          console.error("Agent error:", data.error);
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

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Send message
  const sendMessage = useCallback(() => {
    if (!inputMessage.trim() || !wsRef.current || isStreaming) return;
    
    wsRef.current.send(JSON.stringify({
      type: "message",
      content: inputMessage,
    }));
    
    setInputMessage("");
  }, [inputMessage, isStreaming]);

  // Load file content
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

  // Save file
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

  // Build file tree
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

  // Render file tree
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

  // Render message
  const renderMessage = (msg: Message) => {
    const isUser = msg.role === "user";
    const isTool = msg.role === "tool";

    if (isTool) {
      return (
        <div key={msg.id} className="px-4 py-2 text-xs font-mono bg-black/20 rounded border border-white/5">
          <div className="text-muted-foreground mb-1">Tool Results:</div>
          <pre className="whitespace-pre-wrap text-green-400">{msg.content}</pre>
        </div>
      );
    }

    return (
      <div
        key={msg.id}
        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      >
        <div
          className={`max-w-[80%] rounded-lg px-4 py-3 ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card/80 border border-white/5"
          }`}
        >
          <div className="whitespace-pre-wrap">{msg.content}</div>
          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/10 text-xs">
              <div className="text-muted-foreground mb-1">Tool Calls:</div>
              {msg.toolCalls.map((tc: any, i: number) => (
                <div key={i} className="font-mono text-yellow-400">
                  {tc.name}({JSON.stringify(tc.arguments).slice(0, 50)}...)
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-12 border-b border-white/5 bg-card/50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard")}
            data-testid="button-back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="font-display font-bold text-sm">DANIEL<span className="text-primary"> AI</span></span>
          <span className="text-muted-foreground">/</span>
          <h1 className="font-display font-semibold">{project?.name || "Loading..."}</h1>
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-white/5 rounded">
            {project?.model}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" data-testid="button-settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Sidebar */}
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
            <div className="h-full flex flex-col bg-card/30 border-r border-white/5">
              {/* Sidebar Tabs */}
              <div className="flex border-b border-white/5">
                <button
                  className={`flex-1 py-2 text-xs font-medium ${
                    activeTab === "chat" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
                  }`}
                  onClick={() => setActiveTab("chat")}
                >
                  <MessageSquare className="h-4 w-4 mx-auto" />
                </button>
                <button
                  className={`flex-1 py-2 text-xs font-medium ${
                    activeTab === "files" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
                  }`}
                  onClick={() => setActiveTab("files")}
                >
                  <Folder className="h-4 w-4 mx-auto" />
                </button>
              </div>

              <ScrollArea className="flex-1">
                {activeTab === "chat" && (
                  <div className="p-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mb-2 border-dashed border-white/10"
                      onClick={() => createChat.mutate()}
                      data-testid="button-new-chat"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      New Chat
                    </Button>
                    {chats.map((chat) => (
                      <div
                        key={chat.id}
                        className={`p-2 rounded cursor-pointer text-sm ${
                          currentChatId === chat.id
                            ? "bg-primary/20 text-primary"
                            : "hover:bg-white/5"
                        }`}
                        onClick={() => setCurrentChatId(chat.id)}
                        data-testid={`chat-${chat.id}`}
                      >
                        {chat.title}
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "files" && (
                  <div className="p-2">
                    <FileTreeNode path="" />
                    {files.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No files yet
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Main Area */}
          <ResizablePanel defaultSize={80}>
            <ResizablePanelGroup direction="horizontal">
              {/* Editor Panel */}
              {selectedFile && (
                <>
                  <ResizablePanel defaultSize={50}>
                    <div className="h-full flex flex-col">
                      <div className="h-10 border-b border-white/5 flex items-center justify-between px-4 bg-card/30">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-400" />
                          <span className="text-sm font-mono">{selectedFile}</span>
                          {isFileModified && (
                            <span className="h-2 w-2 rounded-full bg-yellow-500" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={saveFile}
                            disabled={!isFileModified}
                            data-testid="button-save-file"
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedFile(null);
                              setFileContent("");
                            }}
                            data-testid="button-close-file"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        value={fileContent}
                        onChange={(e) => {
                          setFileContent(e.target.value);
                          setIsFileModified(true);
                        }}
                        className="flex-1 font-mono text-sm border-0 rounded-none resize-none bg-background/50 focus-visible:ring-0"
                        placeholder="File content..."
                        data-testid="editor-content"
                      />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                </>
              )}

              {/* Chat Panel */}
              <ResizablePanel defaultSize={selectedFile ? 50 : 100}>
                <div className="h-full flex flex-col">
                  {/* Messages */}
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {messages.map(renderMessage)}
                      
                      {/* Streaming content */}
                      {isStreaming && (
                        <div className="space-y-2">
                          {streamingContent && (
                            <div className="flex justify-start">
                              <div className="max-w-[80%] rounded-lg px-4 py-3 bg-card/80 border border-white/5">
                                <div className="whitespace-pre-wrap">{streamingContent}</div>
                              </div>
                            </div>
                          )}
                          
                          {streamingToolCalls.map((tc, i) => (
                            <div key={i} className="px-4 py-2 text-xs font-mono bg-yellow-500/10 rounded border border-yellow-500/20">
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
                                <span className="text-yellow-500">Executing: {tc.name}</span>
                              </div>
                            </div>
                          ))}
                          
                          {streamingToolResults.map((tr, i) => (
                            <div key={i} className="px-4 py-2 text-xs font-mono bg-green-500/10 rounded border border-green-500/20">
                              <div className="text-green-500 mb-1">✓ {tr.name}</div>
                              <pre className="whitespace-pre-wrap text-muted-foreground max-h-32 overflow-auto">
                                {tr.result.slice(0, 500)}{tr.result.length > 500 && "..."}
                              </pre>
                            </div>
                          ))}
                          
                          {!streamingContent && streamingToolCalls.length === 0 && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Thinking...</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Input */}
                  <div className="p-4 border-t border-white/5 bg-card/30">
                    <div className="flex gap-2">
                      <Input
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        placeholder="Tell the AI what to build..."
                        disabled={isStreaming}
                        className="flex-1 bg-background/50 border-white/10"
                        data-testid="input-message"
                      />
                      <Button
                        onClick={sendMessage}
                        disabled={isStreaming || !inputMessage.trim()}
                        className="bg-primary text-primary-foreground"
                        data-testid="button-send"
                      >
                        {isStreaming ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
