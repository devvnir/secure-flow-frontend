'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@nextui-org/react';
import { Mail, Lock, Shield, ArrowRight, User } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('http://localhost:8000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      if (!response.ok) {
        throw new Error('Registration failed');
      }

      router.push('/login?registered=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full overflow-hidden relative">
      {/* Animated gradient background */}
      <div className="absolute inset-0">
        <div className="absolute top-0 -left-40 w-80 h-80 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-40 -right-40 w-80 h-80 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-80 h-80 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-black opacity-60"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl p-8 md:p-10">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 mb-4 mx-auto">
                <User className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Get Started</h1>
              <p className="text-slate-400">Create your Secure Flow account</p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
                <p className="text-red-300 text-sm font-medium flex items-center gap-2">
                  <span>⚠️</span> {error}
                </p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Input */}
              <div>
                <label className="text-slate-300 text-sm font-semibold mb-2 block">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    disabled={loading}
                    required
                    className={`w-full bg-white/5 border rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-slate-600 outline-none transition-all duration-300 ${
                      focusedField === 'email'
                        ? 'border-purple-500/50 shadow-lg shadow-purple-500/10 bg-white/10'
                        : 'border-slate-600/30 hover:bg-white/10'
                    }`}
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="text-slate-300 text-sm font-semibold mb-2 block">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 pointer-events-none" />
                  <input
                    type="password"
                    placeholder="Create a strong password"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    disabled={loading}
                    required
                    className={`w-full bg-white/5 border rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-slate-600 outline-none transition-all duration-300 ${
                      focusedField === 'password'
                        ? 'border-purple-500/50 shadow-lg shadow-purple-500/10 bg-white/10'
                        : 'border-slate-600/30 hover:bg-white/10'
                    }`}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">Minimum 8 characters</p>
              </div>

              {/* Confirm Password Input */}
              <div>
                <label className="text-slate-300 text-sm font-semibold mb-2 block">Confirm Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 pointer-events-none" />
                  <input
                    type="password"
                    placeholder="Re-enter your password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleChange('confirmPassword', e.target.value)}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField(null)}
                    disabled={loading}
                    required
                    className={`w-full bg-white/5 border rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-slate-600 outline-none transition-all duration-300 ${
                      focusedField === 'confirmPassword'
                        ? 'border-purple-500/50 shadow-lg shadow-purple-500/10 bg-white/10'
                        : 'border-slate-600/30 hover:bg-white/10'
                    }`}
                  />
                </div>
              </div>

              {/* Terms & Conditions */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" className="w-4 h-4 rounded mt-0.5 accent-purple-500" required />
                <span className="text-slate-400 group-hover:text-slate-300 transition text-sm">
                  I agree to the{' '}
                  <Link href="/terms" className="text-purple-400 hover:text-purple-300">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-purple-400 hover:text-purple-300">
                    Privacy Policy
                  </Link>
                </span>
              </label>

              {/* Submit Button */}
              <Button
                fullWidth
                type="submit"
                disabled={loading}
                isLoading={loading}
                className="mt-8 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold py-6 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all duration-300 shadow-lg hover:shadow-purple-500/30 disabled:opacity-50"
                endContent={!loading && <ArrowRight className="w-5 h-5" />}
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>

            {/* Divider */}
            <div className="my-6 flex items-center gap-4">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
              <span className="text-slate-500 text-xs">OR</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
            </div>

            {/* Login Link */}
            <div className="text-center">
              <p className="text-slate-400 text-sm">
                Already have an account?{' '}
                <Link href="/login" className="text-purple-400 hover:text-purple-300 font-semibold transition">
                  Sign in here
                </Link>
              </p>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-slate-700/50 flex gap-4 text-xs text-slate-500 justify-center">
              <Link href="#" className="hover:text-slate-400 transition">Privacy</Link>
              <span>•</span>
              <Link href="#" className="hover:text-slate-400 transition">Terms</Link>
              <span>•</span>
              <Link href="#" className="hover:text-slate-400 transition">Support</Link>
            </div>
          </div>
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
