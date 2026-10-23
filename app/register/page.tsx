'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { publicPost } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await publicPost('/api/auth/register', { email, password });
      router.push('/login?registered=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start building secure data flows"
      footer={<>Already have an account? <Link href="/login" className="font-medium text-sky-400 hover:text-sky-300">Sign in</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} required className={inputClass} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters">
          <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} required className={inputClass} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm-password">
          <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} required className={inputClass} />
        </Field>
        <Button type="submit" variant="primary" loading={loading} className="w-full">
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
