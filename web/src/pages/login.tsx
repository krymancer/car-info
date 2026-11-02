import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CarFront } from "lucide-react";
import { api, getServerUrl, isNativeApp, setServerUrl, setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginPage({ needsPassword, unreachable }: { needsPassword: boolean; unreachable: boolean }) {
  const [server, setServer] = useState(getServerUrl());
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const showServer = isNativeApp() || unreachable;

  const login = useMutation({
    mutationFn: async () => {
      if (showServer) setServerUrl(server.trim());
      const session = await api<{ auth_required: boolean }>("/session");
      if (session.auth_required) {
        const { token } = await api<{ token: string }>("/login", { method: "POST", body: { password } });
        setToken(token);
      }
    },
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries();
    },
    onError: (e) => setError(e instanceof TypeError ? "Can't reach the server" : (e as Error).message),
  });

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CarFront className="size-5" /> Car Info</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate();
            }}
          >
            {showServer && (
              <div className="space-y-1">
                <Label htmlFor="server">Server URL</Label>
                <Input id="server" inputMode="url" placeholder="https://cars.homelab.example" value={server} onChange={(e) => setServer(e.target.value)} />
              </div>
            )}
            {(needsPassword || showServer) && (
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoFocus={!showServer} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-9 w-full" disabled={login.isPending}>
              {login.isPending ? "Connecting…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
