import { useSocketEvents } from "@/hooks/use-socket";
import { useGetBotStatus, useStartBot, useStopBot, getGetBotStatusQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Square, Activity, Database, Terminal as TerminalIcon, AlertCircle, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

export function Dashboard() {
  const { logs, clearLogs } = useSocketEvents();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading } = useGetBotStatus({
    query: {
      refetchInterval: 5000,
      queryKey: getGetBotStatusQueryKey(),
    }
  });

  const startBot = useStartBot({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bot Started", description: "The backup bot is now running." });
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to start bot", description: err.data?.error || "Unknown error", variant: "destructive" });
      }
    }
  });

  const stopBot = useStopBot({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bot Stopped", description: "The backup bot has been stopped." });
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to stop bot", description: err.data?.error || "Unknown error", variant: "destructive" });
      }
    }
  });

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const isRunning = status?.running;
  const isConfigured = status?.configured;

  const formatUptime = (ms: number | null) => {
    if (!ms) return "00:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'success': return 'text-primary';
      case 'error': return 'text-destructive';
      case 'warn': return 'text-amber-500';
      default: return 'text-slate-400';
    }
  };

  if (!isConfigured && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center p-6 space-y-4 border rounded-xl border-dashed border-border bg-card/20">
        <AlertCircle className="w-10 h-10 text-muted-foreground" />
        <h3 className="font-mono text-lg font-bold tracking-tight">NOT CONFIGURED</h3>
        <p className="text-sm text-muted-foreground font-sans">
          Go to the CONFIG tab and enter your Pterodactyl Client API key.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0">
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm relative overflow-hidden">
          <div className={`absolute inset-0 opacity-10 ${isRunning ? 'bg-primary' : 'bg-muted'} transition-colors duration-1000`} />
          <CardContent className="p-4 flex flex-col gap-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground uppercase">Status</span>
              <Activity className={`w-3.5 h-3.5 ${isRunning ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
            </div>
            <div className="font-mono text-lg font-bold">
              {isRunning
                ? <span className="text-primary tracking-widest">RUNNING</span>
                : <span className="text-muted-foreground tracking-widest">STOPPED</span>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
          <CardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground uppercase">Backups</span>
              <Database className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="font-mono text-lg font-bold text-foreground">
              {status?.backupCount || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="text-xs font-mono text-muted-foreground flex justify-between items-center bg-card/30 p-2 rounded border border-border/30">
          <span>UPTIME:</span>
          <span className="text-foreground">{formatUptime(status?.uptime || null)}</span>
        </div>
        <div className="text-xs font-mono text-muted-foreground flex justify-between items-center bg-card/30 p-2 rounded border border-border/30">
          <span>LAST:</span>
          <span className="text-foreground truncate ml-2">
            {status?.lastBackupAt ? new Date(status.lastBackupAt).toLocaleTimeString() : 'NEVER'}
          </span>
        </div>
      </div>

      {status?.currentAction && (
        <div className="text-xs font-mono p-2 bg-primary/10 border border-primary/30 rounded text-primary flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="truncate">{status.currentAction.toUpperCase()}</span>
        </div>
      )}

      {/* Terminal Logs */}
      <div className="flex-1 min-h-[250px] rounded-md border border-border/50 bg-zinc-950 flex flex-col overflow-hidden shadow-inner">
        <div className="h-6 bg-secondary/50 flex items-center px-3 border-b border-border/50 shrink-0">
          <TerminalIcon className="w-3 h-3 mr-2 text-muted-foreground" />
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest flex-1">Terminal Output</span>
          <button
            onClick={clearLogs}
            className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60 hover:text-destructive transition-colors px-1"
            title="Clear logs"
          >
            <Trash2 className="w-3 h-3" />
            <span className="uppercase tracking-widest">Clear</span>
          </button>
        </div>
        <div className="p-2 overflow-y-auto terminal-scroll flex-1 font-mono text-[10px] leading-relaxed break-all">
          {logs.length === 0 ? (
            <div className="text-muted-foreground/40 italic">Waiting for logs...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="mb-1 flex gap-2">
                <span className="text-muted-foreground/50 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                </span>
                <span className={getLogColor(log.level)}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      <div className="pt-2">
        <Button
          onClick={() => isRunning ? stopBot.mutate() : startBot.mutate()}
          className={`w-full font-mono text-sm tracking-widest h-12 shadow-lg transition-all ${
            isRunning
              ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-t border-white/20"
              : "bg-primary hover:bg-primary/90 text-primary-foreground border-t border-white/20"
          }`}
          disabled={startBot.isPending || stopBot.isPending}
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <Square className="w-4 h-4 fill-current" /> STOP BOT
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Play className="w-4 h-4 fill-current" /> START BOT
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
