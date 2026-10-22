'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Shield } from 'lucide-react';
import { useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

// Custom Dropdown Component
function CustomDropdown({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  required?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-300 mb-2">
        {label} {required && '*'}
      </label>
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          type="button"
          className="w-full bg-white/5 border border-slate-600/30 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/10 transition-all duration-300 hover:bg-white/10 flex items-center justify-between"
        >
          <span>{value}</span>
          <ChevronDown
            className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl shadow-2xl backdrop-blur-xl z-50 overflow-hidden">
            {options.map((option) => (
              <button
                key={option}
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                type="button"
                className={`w-full px-4 py-3 text-left text-sm font-medium transition-all duration-200 ${
                  value === option
                    ? 'bg-cyan-500/20 text-cyan-300 border-l-2 border-l-cyan-500'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CreateFlowPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    source_type: 'CSV',
    destination_type: 'Database',
    encryption_enabled: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCreateFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('access_token');

      if (!token) {
        router.push('/login');
        return;
      }

      // Parse JWT to get user ID
      const tokenParts = token.split('.');
      const decodedToken = tokenParts[1] ? JSON.parse(atob(tokenParts[1])) : null;
      const userId = decodedToken?.sub;

      if (!userId) {
        throw new Error('User ID not found in token');
      }

      const payload = {
        ...formData,
        created_by: userId,
        source_config: {},
        destination_config: {},
      };

      const response = await fetch('http://localhost:8000/api/data-flows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to create flow');
      }

      // Navigate back to dashboard
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flow');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-slate-700/50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Secure Flow</h1>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-all duration-300 border border-slate-600 hover:border-slate-500"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="backdrop-blur-xl bg-white/5 border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white">Create New Data Flow</h2>
            <p className="text-slate-400 text-base mt-2">Configure source, destination, and security settings for your secure data flow</p>
          </div>

          {/* Form */}
          <form onSubmit={handleCreateFlow} className="space-y-8">
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
                <p className="text-red-300">{error}</p>
              </div>
            )}

            {/* Flow Name */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Flow Name *</label>
              <input
                type="text"
                placeholder="e.g., Customer Data Sync"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full bg-white/5 border border-slate-600/30 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/10 transition-all duration-300"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Description</label>
              <textarea
                placeholder="Describe what this data flow does..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-white/5 border border-slate-600/30 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/10 transition-all duration-300 resize-none h-32"
              />
            </div>

            {/* Source & Destination */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CustomDropdown
                label="Source Type"
                value={formData.source_type}
                onChange={(value) => setFormData({ ...formData, source_type: value })}
                options={['CSV', 'API', 'Database', 'S3', 'RESO']}
                required
              />
              <CustomDropdown
                label="Destination Type"
                value={formData.destination_type}
                onChange={(value) => setFormData({ ...formData, destination_type: value })}
                options={['Database', 'API', 'CSV', 'S3']}
                required
              />
            </div>

            {/* Encryption */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
              <input
                type="checkbox"
                id="encryption"
                checked={formData.encryption_enabled}
                onChange={(e) => setFormData({ ...formData, encryption_enabled: e.target.checked })}
                className="w-5 h-5 rounded accent-cyan-500 cursor-pointer"
              />
              <div className="flex-1">
                <label htmlFor="encryption" className="text-sm font-semibold text-white cursor-pointer">
                  Enable Encryption
                </label>
                <p className="text-xs text-slate-400 mt-0.5">Recommended for sensitive data</p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-4 pt-6 border-t border-slate-700/50">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-all duration-300 border border-slate-600 hover:border-slate-500"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    Create Flow
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
