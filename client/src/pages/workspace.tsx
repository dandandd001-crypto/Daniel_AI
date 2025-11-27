import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ChevronLeft, Send, Folder, FileText, Plus, MessageSquare, Settings, 
  Loader2, FolderOpen, ChevronDown, X, Eye, Terminal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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
  
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  
  // Panel visibility states
  const [showChat, setShowChat] = useState(true);
  const [showConsole, setShowConsole] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [showFiles, setShowFiles] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: project, refetch: refetchProject } = useQuery<Project>({
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

  const updateApiKeyMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await fetch(`/api/projects/${projectId}/api-key`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) throw new Error("Failed to update API key");
      return res.json();
    },
    onSuccess: () => {
      refetchProject();
      setSettingsOpen(false);
      setNewApiKey("");
    },
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
        case "done":
          setIsStreaming(false);
          refetchMessages();
          refetchFiles();
          break;
        case "error":
          setIsStreaming(false);
          break;
      }
    };

    return () => {
      ws.close();
    };
  }, [projectId, currentChatId, refetchMessages, refetchFiles]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(() => {
    if (!inputMessage.trim() || !wsRef.current) return;
    
    const msg = inputMessage.trim();
    setInputMessage("");
    setIsStreaming(true);
    
    wsRef.current.send(JSON.stringify({
      type: "message",
      content: msg,
    }));
  }, [inputMessage]);

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
            <CollapsibleTrigger className="flex items-center gap-1 w-full px-2 py-1 hover:bg-white/5 rounded text-xs">
              <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
              <FolderOpen className="h-3 w-3 text-yellow-500" />
              <span className="truncate">{dir.path.split("/").pop()}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-3">
              <FileTreeNode path={dir.path} depth={depth + 1} />
            </CollapsibleContent>
          </Collapsible>
        ))}
        {filesInDir.map((file) => (
          <div
            key={file.id}
            className={`flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded text-xs cursor-pointer`}
            data-testid={`file-${file.path}`}
          >
            <FileText className="h-3 w-3 text-blue-400" />
            <span className="truncate text-xs">{file.path.split("/").pop()}</span>
          </div>
        ))}
      </>
    );
  };

  const renderMessage = (msg: Message) => {
    const isUser = msg.role === "user";
    return (
      <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
        <div className={`max-w-[85%] rounded px-3 py-2 text-xs ${isUser ? "bg-primary text-primary-foreground" : "bg-card/80 border border-white/5"}`}>
          <div className="whitespace-pre-wrap">{msg.content}</div>
        </div>
      </div>
    );
  };

  const PanelButton = ({ icon: Icon, label, isActive, onClick }: any) => (
    <Button
      variant={isActive ? "default" : "outline"}
      size="sm"
      className="h-7 text-xs"
      onClick={onClick}
    >
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Button>
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-10 border-b border-white/5 bg-card/50 flex items-center justify-between px-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")} className="h-7 w-7" data-testid="button-back">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-bold text-xs hidden sm:inline">DANIEL<span className="text-primary">AI</span></span>
          <span className="text-muted-foreground text-xs">/</span>
          <h1 className="font-semibold text-xs truncate">{project?.name || "Loading..."}</h1>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-white/5 rounded">{project?.model}</span>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7" 
          data-testid="button-settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </header>

      {/* Panel Toggle Buttons */}
      <div className="h-8 border-b border-white/5 bg-card/30 px-3 flex items-center gap-2 overflow-x-auto">
        <PanelButton icon={MessageSquare} label="Chat" isActive={showChat} onClick={() => setShowChat(!showChat)} />
        <PanelButton icon={Terminal} label="Console" isActive={showConsole} onClick={() => setShowConsole(!showConsole)} />
        <PanelButton icon={Eye} label="Preview" isActive={showPreview} onClick={() => setShowPreview(!showPreview)} />
        <PanelButton icon={Folder} label="Files" isActive={showFiles} onClick={() => setShowFiles(!showFiles)} />
      </div>

      {/* Settings Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Project Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">API Key</label>
              <Input
                type="password"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="Enter new API key"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Update your {project?.provider} API key</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => updateApiKeyMutation.mutate(newApiKey)}
              disabled={!newApiKey.trim() || updateApiKeyMutation.isPending}
            >
              {updateApiKeyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup direction="vertical">
          {/* Chat Panel */}
          {showChat && (
            <>
              <ResizablePanel defaultSize={33} minSize={20}>
                <div className="h-full flex flex-col bg-background">
                  <div className="h-6 border-b border-white/5 px-2 flex items-center text-xs font-semibold text-muted-foreground bg-card/30">
                    Chat
                  </div>
                  <div className="border-b border-white/5 p-1 space-y-1">
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = async (event) => {
                            const base64 = (event.target?.result as string).split(",")[1];
                            try {
                              await fetch(`/api/projects/${projectId}/files/upload`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ file: base64, filename: file.name }),
                              });
                              refetchFiles();
                            } catch (error) {
                              console.error("Upload failed:", error);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-6 text-xs border-dashed border-white/10"
                      onClick={() => document.getElementById("file-upload")?.click()}
                      data-testid="button-upload-file"
                    >
                      <Plus className="h-2.5 w-2.5 mr-1" />
                      Upload
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-6 text-xs border-dashed border-white/10"
                      onClick={() => createChat.mutate()}
                      data-testid="button-new-chat"
                    >
                      <Plus className="h-2.5 w-2.5 mr-1" />
                      New Chat
                    </Button>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2">
                      {messages.map(renderMessage)}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                  <div className="border-t border-white/5 p-2 bg-card/50">
                    <div className="flex gap-1">
                      <Input
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        placeholder="Ask AI..."
                        disabled={isStreaming}
                        className="flex-1 h-7 text-xs bg-background/50 border-white/10"
                        data-testid="input-message"
                      />
                      <Button
                        onClick={sendMessage}
                        disabled={isStreaming || !inputMessage.trim()}
                        size="sm"
                        className="h-7 px-2"
                        data-testid="button-send"
                      >
                        {isStreaming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}

          {/* Console Panel */}
          {showConsole && (
            <>
              <ResizablePanel defaultSize={33} minSize={20}>
                <div className="h-full flex flex-col bg-background">
                  <div className="h-6 border-b border-white/5 px-2 flex items-center text-xs font-semibold text-muted-foreground bg-card/30">
                    Console
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="font-mono text-xs p-3 text-muted-foreground whitespace-pre-wrap">
                      Ready for commands
                    </div>
                  </ScrollArea>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}

          {/* Preview Panel */}
          {showPreview && (
            <>
              <ResizablePanel defaultSize={33} minSize={20}>
                <div className="h-full flex flex-col bg-background">
                  <div className="h-6 border-b border-white/5 px-2 flex items-center text-xs font-semibold text-muted-foreground bg-card/30">
                    Preview
                  </div>
                  <iframe
                    src="http://localhost:8000/"
                    className="flex-1 border-0 bg-white"
                    title="App Preview"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}

          {/* Files Panel */}
          {showFiles && (
            <ResizablePanel defaultSize={33} minSize={20}>
              <div className="h-full flex flex-col bg-card/30">
                <div className="h-6 border-b border-white/5 px-2 flex items-center text-xs font-semibold text-muted-foreground bg-card/50">
                  Files
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-1.5">
                    <FileTreeNode path="" />
                    {files.length === 0 && (
                      <div className="text-center py-6 text-muted-foreground text-xs">No files</div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </ResizablePanel>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
