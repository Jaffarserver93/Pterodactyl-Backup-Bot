import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  useGetTelegramStatus, 
  getGetTelegramStatusQueryKey,
  useInitTelegram,
  useVerifyTelegramOtp,
  useDisconnectTelegram
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Phone, KeyRound, Shield, LogOut, CheckCircle2 } from "lucide-react";
import { useSocketEvents } from "@/hooks/use-socket";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const initSchema = z.object({
  apiId: z.coerce.number().min(1, { message: "API ID is required" }),
  apiHash: z.string().min(1, { message: "API Hash is required" }),
  phoneNumber: z.string().min(1, { message: "Phone number is required (+1234567890)" }),
});

const otpSchema = z.object({
  code: z.string().min(5, { message: "OTP Code is required" }),
});

type InitFormValues = z.infer<typeof initSchema>;
type OtpFormValues = z.infer<typeof otpSchema>;

export function TelegramSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { otpRequired, clearOtpRequired } = useSocketEvents();

  const { data: status, isLoading } = useGetTelegramStatus({
    query: {
      refetchInterval: 5000,
      queryKey: getGetTelegramStatusQueryKey(),
    }
  });

  const initMutation = useInitTelegram({
    mutation: {
      onSuccess: () => {
        toast({ title: "Initializing", description: "Requesting OTP code..." });
        queryClient.invalidateQueries({ queryKey: getGetTelegramStatusQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Init Failed", description: err.data?.error || "Failed to initialize", variant: "destructive" });
      }
    }
  });

  const verifyMutation = useVerifyTelegramOtp({
    mutation: {
      onSuccess: () => {
        toast({ title: "Success", description: "Telegram authenticated successfully." });
        clearOtpRequired();
        queryClient.invalidateQueries({ queryKey: getGetTelegramStatusQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Verification Failed", description: err.data?.error || "Failed to verify OTP", variant: "destructive" });
      }
    }
  });

  const disconnectMutation = useDisconnectTelegram({
    mutation: {
      onSuccess: () => {
        toast({ title: "Disconnected", description: "Telegram session removed." });
        clearOtpRequired();
        queryClient.invalidateQueries({ queryKey: getGetTelegramStatusQueryKey() });
      },
      onError: (err) => {
        const msg = (err.data as { error?: string } | null)?.error || "Failed to disconnect";
        toast({ title: "Disconnect Failed", description: msg, variant: "destructive" });
      }
    }
  });

  const initForm = useForm<InitFormValues>({
    resolver: zodResolver(initSchema),
    defaultValues: {
      apiId: 0,
      apiHash: "",
      phoneNumber: "",
    },
  });

  const otpForm = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: {
      code: "",
    },
  });

  function onInitSubmit(data: InitFormValues) {
    initMutation.mutate({ data });
  }

  function onOtpSubmit(data: OtpFormValues) {
    verifyMutation.mutate({ data });
  }

  // Pre-fill phone number if available from status
  useEffect(() => {
    if (status?.phoneNumber && !initForm.getValues("phoneNumber")) {
      initForm.setValue("phoneNumber", status.phoneNumber);
    }
  }, [status, initForm]);

  const isConnected = status?.connected && status?.authenticated;
  const isAwaitingOtp = status?.awaitingOtp || !!otpRequired;

  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-sm tracking-widest text-primary flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              TELEGRAM AUTH
            </CardTitle>
            {isLoading ? (
              <Badge variant="outline" className="bg-muted text-muted-foreground animate-pulse font-mono text-[10px]">
                LOADING...
              </Badge>
            ) : isConnected ? (
              <Badge className="bg-primary text-primary-foreground font-mono text-[10px] tracking-widest border-transparent">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                CONNECTED
              </Badge>
            ) : isAwaitingOtp ? (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 font-mono text-[10px] tracking-widest">
                AWAITING OTP
              </Badge>
            ) : (
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground tracking-widest">
                DISCONNECTED
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs pt-1">
            Connect your Telegram account to receive backup archives directly in your Saved Messages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          
          {isConnected ? (
            <div className="space-y-6">
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-md flex items-start gap-3">
                <Shield className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-mono text-sm text-foreground mb-1 font-bold">SESSION ACTIVE</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The bot is successfully connected to Telegram as <span className="text-foreground font-mono">{status?.phoneNumber}</span>. 
                    Backups will be automatically sent when generated.
                  </p>
                </div>
              </div>

              <Button 
                variant="destructive" 
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="w-full font-mono text-xs tracking-widest"
              >
                {disconnectMutation.isPending ? "DISCONNECTING..." : (
                  <span className="flex items-center gap-2"><LogOut className="w-4 h-4" /> DISCONNECT SESSION</span>
                )}
              </Button>
            </div>
          ) : isAwaitingOtp ? (
            <div className="space-y-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-500/90 text-xs flex gap-2">
                <KeyRound className="w-4 h-4 shrink-0" />
                <span>An OTP code was sent to your Telegram app for {status?.phoneNumber || otpRequired?.phoneNumber}.</span>
              </div>

              <Form {...otpForm}>
                <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
                  <FormField
                    control={otpForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">OTP Code</FormLabel>
                        <FormControl>
                          <Input placeholder="12345" className="font-mono text-center tracking-widest text-lg h-12 bg-background/50" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button 
                      type="button"
                      variant="outline"
                      className="w-1/3 font-mono text-xs"
                      onClick={() => {
                        clearOtpRequired();
                        disconnectMutation.mutate();
                      }}
                      disabled={verifyMutation.isPending}
                    >
                      CANCEL
                    </Button>
                    <Button 
                      type="submit" 
                      className="w-2/3 font-mono text-xs tracking-widest"
                      disabled={verifyMutation.isPending}
                    >
                      {verifyMutation.isPending ? "VERIFYING..." : "VERIFY CODE"}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          ) : (
            <Form {...initForm}>
              <form onSubmit={initForm.handleSubmit(onInitSubmit)} className="space-y-4">
                <FormField
                  control={initForm.control}
                  name="apiId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">API ID</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="123456" className="font-mono text-sm bg-background/50" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={initForm.control}
                  name="apiHash"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">API Hash</FormLabel>
                      <FormControl>
                        <Input placeholder="abcdef1234567890abcdef1234567890" className="font-mono text-sm bg-background/50" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={initForm.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Phone Number</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input placeholder="+1234567890" className="pl-9 font-mono text-sm bg-background/50" {...field} />
                        </div>
                      </FormControl>
                      <FormDescription className="text-[10px]">Include country code (e.g., +1)</FormDescription>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full font-mono text-xs tracking-widest mt-2" 
                  disabled={initMutation.isPending}
                >
                  {initMutation.isPending ? "CONNECTING..." : "CONNECT TELEGRAM"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
      
      <div className="text-center text-[10px] text-muted-foreground/50 font-mono">
        <p>Get API credentials from my.telegram.org</p>
      </div>
    </div>
  );
}
