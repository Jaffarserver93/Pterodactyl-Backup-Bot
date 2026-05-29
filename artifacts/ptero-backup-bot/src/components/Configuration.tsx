import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSaveConfig, useGetConfig, useGetBotStatus, getGetBotStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Server } from "lucide-react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const configSchema = z.object({
  panelUrl: z.string().url({ message: "Must be a valid URL" }),
  username: z.string().min(1, { message: "Username/Email is required" }),
  password: z.string().min(1, { message: "Password is required" }),
  serverId: z.string().min(1, { message: "Server ID is required" }),
  backupIntervalMinutes: z.coerce.number().min(1).default(5),
});

type ConfigFormValues = z.infer<typeof configSchema>;

export function Configuration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: savedConfig } = useGetConfig();
  const { data: status } = useGetBotStatus({
    query: {
      queryKey: getGetBotStatusQueryKey(),
    }
  });

  const saveConfig = useSaveConfig({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Configuration Saved",
          description: "Your backup bot configuration has been saved to the database.",
        });
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      },
      onError: (err) => {
        toast({
          title: "Failed to save configuration",
          description: err.data?.error || "An unknown error occurred",
          variant: "destructive",
        });
      }
    }
  });

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      panelUrl: "",
      username: "",
      password: "",
      serverId: "",
      backupIntervalMinutes: 5,
    },
  });

  // Pre-fill form with saved config from the database (password excluded for security)
  useEffect(() => {
    const cfg = savedConfig?.config;
    if (cfg) {
      form.reset({
        panelUrl: cfg.panelUrl ?? "",
        username: cfg.username ?? "",
        password: "",
        serverId: cfg.serverId ?? "",
        backupIntervalMinutes: cfg.backupIntervalMinutes ?? 5,
      });
    }
  }, [savedConfig]);

  function onSubmit(data: ConfigFormValues) {
    saveConfig.mutate({ data });
  }

  const hasSavedConfig = !!savedConfig?.config;

  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-mono text-sm tracking-widest text-primary flex items-center gap-2">
            <Server className="w-4 h-4" />
            PANEL CONNECTION
          </CardTitle>
          <CardDescription className="text-xs">
            {hasSavedConfig
              ? "Config loaded from database. Enter your password to save changes."
              : "Enter your Pterodactyl panel credentials and target server."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="panelUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Panel URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://panel.example.com" className="font-mono text-sm bg-background/50" {...field} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Username / Email</FormLabel>
                      <FormControl>
                        <Input placeholder="admin@example.com" className="font-mono text-sm bg-background/50" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Password{hasSavedConfig ? " (required to save)" : ""}
                      </FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" className="font-mono text-sm bg-background/50" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="serverId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Server ID</FormLabel>
                      <FormControl>
                        <Input placeholder="8b13c2f" className="font-mono text-sm bg-background/50" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="backupIntervalMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Interval (Min)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" placeholder="5" className="font-mono text-sm bg-background/50" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                className="w-full font-mono text-sm tracking-wider"
                disabled={saveConfig.isPending}
              >
                {saveConfig.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    SAVING...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    SAVE CONFIG
                  </span>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
