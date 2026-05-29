import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dashboard } from "@/components/Dashboard";
import { Configuration } from "@/components/Configuration";
import { TelegramSettings } from "@/components/Telegram";
import { Terminal, Settings, MessageSquare } from "lucide-react";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-[100dvh] w-full bg-background text-foreground flex justify-center">
          <main className="w-full max-w-[480px] min-h-[100dvh] flex flex-col border-x border-border/50 bg-card/30 relative">
            <header className="sticky top-0 z-10 p-4 border-b border-border/50 bg-background/80 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Terminal className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="font-mono font-bold tracking-tight text-lg leading-none">PTEROBOT</h1>
                  <p className="text-xs text-muted-foreground font-mono">Automated Backup System</p>
                </div>
              </div>
            </header>

            <Tabs defaultValue="dashboard" className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-3 rounded-none border-b border-border/50 bg-transparent h-12 p-0">
                <TabsTrigger value="dashboard" className="rounded-none data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary h-full font-mono text-xs">
                  <ActivityIcon className="w-3.5 h-3.5 mr-2" />
                  STATUS
                </TabsTrigger>
                <TabsTrigger value="config" className="rounded-none data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary h-full font-mono text-xs">
                  <Settings className="w-3.5 h-3.5 mr-2" />
                  CONFIG
                </TabsTrigger>
                <TabsTrigger value="telegram" className="rounded-none data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary h-full font-mono text-xs">
                  <MessageSquare className="w-3.5 h-3.5 mr-2" />
                  TELEGRAM
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto p-4">
                <TabsContent value="dashboard" className="m-0 h-full outline-none data-[state=active]:flex flex-col gap-4">
                  <Dashboard />
                </TabsContent>
                <TabsContent value="config" className="m-0 outline-none">
                  <Configuration />
                </TabsContent>
                <TabsContent value="telegram" className="m-0 outline-none">
                  <TelegramSettings />
                </TabsContent>
              </div>
            </Tabs>
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function ActivityIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  )
}

export default App;
