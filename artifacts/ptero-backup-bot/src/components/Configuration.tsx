import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSaveConfig, useGetConfig, useGetBotStatus, getGetBotStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Server, Key } from "lucide-react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const configSchema = z.object({
  panelUrl: z.string().url({ message: "Must be a valid URL" }),
  apiKey: z.string().min(1, { message: "API key is required" }),
  serverId: z.string().min(1, { message: "Server ID is required" }),
  backupIntervalMinutes: z.coerce.number().min(1).default(5),
});

type ConfigFormValues = z.infer<typeof configSchema>;

export function Configuration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: savedConfig } = useGetConfig();
  useGetBotStatus({ query: { queryKey: getGetBotStatusQueryKey() } });

  const saveConfig = useSaveConfig({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Configuration Saved",
          description: "Your API key and server settings have been saved.",
        });
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      },
      onError: (err) => {
        toast({
          title: "Failed to save configuration",
          description: err.data?.error || "An unknown error occurred",
          variant: "destructive",
        });
      },
    },
  });

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      panelUrl: "",
      apiKey: "",
      serverId: "",
      backupIntervalMinutes: 5,
    },
  });

  useEffect(() => {
    const cfg = savedConfig?.config;
    if (cfg) {
      form.reset({
        panelUrl: cfg.panelUrl ?? "",
        apiKey: cfg.apiKey ?? "",
        serverId: cfg.serverId ?? "",
        backupIntervalMinutes: cfg.backupIntervalMinutes ?? 5,
      });
    }
  }, [savedConfig]);

  function onSubmit(data: ConfigFormValues) {
    saveConfig.mutate({ data });
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-mono text-sm tracking-widest text-primary flex items-center gap-2">
            <Server className="w-4 h-4" />
            PANEL CONNECTION
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Generate a Client API key in your panel under{" "}
            <span className="font-mono text-foreground/70">Account &rarr; API Credentials</span>.
            No username or password needed.
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
                    <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Panel URL
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://panel.example.com"
                        className="font-mono text-sm bg-background/50"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Key className="w-3 h-3" /> Client API Key
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="ptlc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="font-mono text-sm bg-background/50"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="serverId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Server ID
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="f29ac483"
                          className="font-mono text-sm bg-background/50"
                          {...field}
                        />
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
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Interval (Min)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          placeholder="5"
                          className="font-mono text-sm bg-background/50"
                          {...field}
                        />
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

      <Card className="border-border/50 bg-card/20">
        <CardContent className="p-4 space-y-2">
          <p className="font-mono text-xs text-primary uppercase tracking-widest">How to get your API key</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside font-sans">
            <li>Log in to your Pterodactyl panel</li>
            <li>
              Click your avatar &rarr; <span className="font-mono text-foreground/70">API Credentials</span>
            </li>
            <li>
              Click <span className="font-mono text-foreground/70">Create New</span>, give it any description
            </li>
            <li>Copy the key starting with <span className="font-mono text-foreground/70">ptlc_</span></li>
          </ol>
          <p className="text-xs text-muted-foreground font-sans pt-1">
            The Server ID is the short alphanumeric ID in your server URL, e.g.{" "}
            <span className="font-mono text-foreground/70">/server/f29ac483</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
