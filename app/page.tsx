"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/select-app");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8"
      >
        <h1 className="text-xl font-semibold mb-1">ICNA Relief Portal</h1>
        <p className="text-sm text-[var(--color-text-dim)] mb-6">
          Staff sign in
        </p>

        <label className="block text-sm mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />

        <label className="block text-sm mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />

        {error && (
          <p className="text-sm text-[#B55139] mb-4">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-2 text-sm disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
