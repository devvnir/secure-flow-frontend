'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { publicPost, saveTokens } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('registered') === 'true') {
      setNotice('Account created. Sign in to continue.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      saveTokens(await publicPost<{ access_token: string; refresh_token: string }>('/api/auth/login', { email, password }));
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to Secure Flow"
      subtitle="Manage your secure data pipelines"
      footer={<>Don&apos;t have an account? <Link href="/register" className="font-medium text-sky-400 hover:text-sky-300">Create one</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {notice && <Notice tone="success">{notice}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} required className={inputClass} />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} required className={inputClass} />
        </Field>
        <Button type="submit" variant="primary" loading={loading} className="w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
