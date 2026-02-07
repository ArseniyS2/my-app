"use client";

import { useState, useSyncExternalStore } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const emptySubscribe = () => () => {};

export default function SignInForm({
  callbackUrl,
  error: initialError,
}: {
  callbackUrl: string;
  error?: string;
}) {
  const router = useRouter();
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState(false);
  const [loginFocused, setLoginFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const loginFloating = loginFocused || login.length > 0;
  const passwordFloating = passwordFocused || password.length > 0;

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      login,
      password,
      redirect: false,
      callbackUrl,
    });

    setLoading(false);

    if (res?.error) {
      setError("Invalid email/username or password.");
      return;
    }

    if (res?.ok) {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  /* ---- SSR placeholder (no <input>s for Dashlane to inject into) ---- */
  if (!isClient) {
    return (
      <div className="space-y-8">
        <div className="relative border-b border-white/90 pt-1 pb-1">
          <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-base text-zinc-600">
            Username
          </span>
          <div className="pt-3 pb-2">&nbsp;</div>
        </div>
        <div className="relative border-b border-white/90 pt-1 pb-1">
          <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-base text-zinc-600">
            Password
          </span>
          <div className="pt-3 pb-2">&nbsp;</div>
        </div>
        <div
          className="w-full rounded-3xl px-5 py-3.5 text-center text-sm font-semibold text-white shadow-lg"
          style={{ backgroundColor: "#E064D6" }}
        >
          Login
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-8"
    >
      {error && (
        <div
          className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      )}
      <div className="relative border-b border-white/90 pt-1 pb-1">
        <label
          htmlFor="login"
          className={`pointer-events-none absolute left-0 text-zinc-800 transition-all duration-200 ease-out ${
            loginFloating
              ? "top-0 -translate-y-full text-xs font-medium"
              : "top-1/2 -translate-y-1/2 text-base text-zinc-600"
          }`}
        >
          Username
        </label>
        <input
          id="login"
          name="login"
          type="text"
          autoComplete="username"
          required
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          onFocus={() => setLoginFocused(true)}
          onBlur={() => setLoginFocused(false)}
          className="block w-full bg-transparent pt-3 pb-2 text-zinc-900 placeholder-transparent focus:outline-none focus:ring-0"
          placeholder="Username"
        />
      </div>
      <div className="relative border-b border-white/90 pt-1 pb-1">
        <label
          htmlFor="password"
          className={`pointer-events-none absolute left-0 text-zinc-800 transition-all duration-200 ease-out ${
            passwordFloating
              ? "top-0 -translate-y-full text-xs font-medium"
              : "top-1/2 -translate-y-1/2 text-base text-zinc-600"
          }`}
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setPasswordFocused(true)}
          onBlur={() => setPasswordFocused(false)}
          className="block w-full bg-transparent pt-3 pb-2 text-zinc-900 placeholder-transparent focus:outline-none focus:ring-0"
          placeholder="Password"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-3xl px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(224,100,214,0.4)] active:scale-[0.98] disabled:scale-100 disabled:opacity-50 disabled:shadow-none"
        style={{ backgroundColor: "#E064D6" }}
      >
        {loading ? "Signing in…" : "Login"}
      </button>
    </form>
  );
}
