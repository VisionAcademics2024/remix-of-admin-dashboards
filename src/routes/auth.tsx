import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarCheck2, GraduationCap, Loader2, ShieldCheck, WalletCards } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/today" });
  },
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
      } else {
        navigate({ to: "/today", replace: true });
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        toast.error(error.message);
      } else if (data.session) {
        toast.success("Account created. An owner needs to approve your access.");
        navigate({ to: "/today", replace: true });
      } else {
        toast.success("Account created. Please check your email to confirm.");
        setMode("signin");
      }
    }

    setLoading(false);
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden px-4 py-8 sm:px-6">
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_27rem]">
        <section className="hidden lg:block">
          <div className="glass glass--thin mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Private operations workspace
          </div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.02] tracking-[-0.055em] text-foreground xl:text-6xl">
            A calmer way to run every tutoring day.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
            Lessons, attendance, student hours and billing stay connected in one focused workspace
            for the Vision Academics team.
          </p>

          <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3">
            {[
              { icon: CalendarCheck2, label: "Daily operations" },
              { icon: GraduationCap, label: "Students & classes" },
              { icon: WalletCards, label: "Hours & billing" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="glass rounded-2xl px-4 py-4 text-sm font-medium">
                <Icon className="mb-3 h-5 w-5 text-primary" />
                {label}
              </div>
            ))}
          </div>
        </section>

        <div className="glass glass--thick animate-spatial-in mx-auto w-full max-w-md rounded-[2rem] p-6 sm:p-8">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-chart-4 text-primary-foreground shadow-[inset_0_1px_0_0_var(--edge-top),0_10px_26px_-14px_var(--color-primary)]">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-[-0.025em]">Vision CRM</p>
              <p className="text-xs text-muted-foreground">Vision Academics operations</p>
            </div>
          </div>

          <div className="mb-5">
            <h2 className="text-2xl font-semibold tracking-[-0.035em]">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {mode === "signin"
                ? "Sign in to continue to the private admin workspace."
                : "An owner will approve access after your account is created."}
            </p>
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-5 rounded-2xl border border-white/35 bg-muted/35 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
            Signing in does not grant access by itself. An owner approves each account; only the
            first account can claim owner access.
          </p>
        </div>
      </div>
    </div>
  );
}
