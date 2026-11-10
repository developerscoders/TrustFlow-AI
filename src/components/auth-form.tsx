'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';

type AuthMode = 'login' | 'register';

type AuthResponse = {
  error?: string;
  id?: string;
  name?: string;
  email?: string;
};

function getSafeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/dashboard';
  }

  // Do not allow encoded backslashes or protocol-relative redirect tricks.
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return '/dashboard';
  }
  if (decoded.startsWith('//') || decoded.includes('\\')) return '/dashboard';

  return value;
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isRegister = mode === 'register';
  const nextPath = getSafeNextPath(searchParams.get('next'));
  const authSwitchHref = `${isRegister ? '/login' : '/register'}${searchParams.get('next') ? `?next=${encodeURIComponent(nextPath)}` : ''}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError('');

    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get('password') ?? '');
    const confirmPassword = String(formData.get('confirmPassword') ?? '');

    if (isRegister && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const body = isRegister
      ? {
          name: String(formData.get('name') ?? '').trim(),
          email,
          password,
        }
      : { email, password };

    setBusy(true);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      let result: AuthResponse = {};

      if (responseText) {
        try {
          result = JSON.parse(responseText) as AuthResponse;
        } catch {
          throw new Error(
            response.ok
              ? 'The server returned an unexpected response. Please try again.'
              : `The server could not complete the request (HTTP ${response.status}). Check the terminal for the server error.`,
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          result.error ||
            (response.status === 503
              ? 'Authentication service is unavailable. Check the MongoDB connection and server terminal.'
              : 'Could not authenticate. Please check your details and try again.'),
        );
      }

      router.replace(nextPath);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not reach the server. Check that the development server is running.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="shell"
      style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}
    >
      <form
        method="post"
        className="card"
        style={{ width: 'min(440px, 100%)', padding: 28 }}
        onSubmit={submit}
        noValidate={false}
      >
        <div className="brand">
          <div className="brandmark">t</div>
          trustflow.
        </div>

        <div className="eyebrow" style={{ marginTop: 28 }}>
          {isRegister ? 'Start your workspace' : 'Welcome back'}
        </div>

        <h1 className="display" style={{ fontSize: 34, fontWeight: 500, margin: '10px 0' }}>
          {isRegister ? 'Create your account' : 'Sign in'}
        </h1>

        <p className="dealmeta">
          {isRegister
            ? 'Use at least 12 characters. Your password is securely hashed before it is stored.'
            : 'Sign in to open your protected workspace.'}
        </p>

        {isRegister && (
          <div className="field">
            <label htmlFor="auth-name">Name</label>
            <input
              id="auth-name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              disabled={busy}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            disabled={busy}
          />
        </div>

        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="auth-password"
              style={{ width: '100%', paddingRight: 44 }}
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={isRegister ? 12 : 1}
              maxLength={128}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              disabled={busy}
              style={{
                position: 'absolute',
                right: 8,
                top: 8,
                border: 0,
                background: 'none',
              }}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        {isRegister && (
          <div className="field">
            <label htmlFor="auth-confirm-password">Confirm password</label>
            <input
              id="auth-confirm-password"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              disabled={busy}
            />
          </div>
        )}

        {error && (
          <p className="error" role="alert" aria-live="polite">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="primary"
          disabled={busy}
          style={{ width: '100%', marginTop: 8 }}
        >
          {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
        </button>

        <p className="dealmeta" style={{ marginTop: 18 }}>
          {isRegister ? 'Already have an account?' : 'New to TrustFlow?'}{' '}
          <a className="textlink" href={authSwitchHref}>
            {isRegister ? 'Sign in' : 'Create an account'}
          </a>
        </p>
      </form>
    </main>
  );
}
