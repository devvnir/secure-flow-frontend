'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shield, Zap } from 'lucide-react';

interface DataFlow {
  id: string;
  name: string;
  description: string;
  source_type: string;
  destination_type: string;
  status: string;
  encryption_enabled: boolean;
  created_at: string;
}

export default function DataFlowDetailPage() {
  const router = useRouter();
  const params = useParams();
  const flowId = params.id as string;

  const [flow, setFlow] = useState<DataFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchFlow = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) {
          router.push('/login');
          return;
        }

        const response = await fetch(`http://localhost:8000/api/data-flows/${flowId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.status === 401) {
          localStorage.removeItem('access_token');
          router.push('/login');
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch data flow');
        }

        const data = await response.json();
        setFlow(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data flow');
      } finally {
        setLoading(false);
      }
    };

    fetchFlow();
  }, [flowId, router]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-400 border border-green-500/30';
      case 'draft':
        return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30';
      case 'paused':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Secure Flow</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {error && (
          <div className="mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-slate-600 border-t-cyan-400 animate-spin mx-auto mb-4"></div>
              <p className="text-slate-400 text-lg">Loading data flow...</p>
            </div>
          </div>
        ) : flow ? (
          <div className="space-y-8">
            {/* Flow Header */}
            <div className="backdrop-blur-xl bg-white/5 border border-slate-700/50 rounded-2xl p-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-4xl font-bold text-white mb-2">{flow.name}</h2>
                  <p className="text-slate-400 text-lg">{flow.description}</p>
                </div>
                <span className={`px-4 py-2 rounded-lg text-sm font-semibold ${getStatusColor(flow.status)} capitalize`}>
                  {flow.status}
                </span>
              </div>
            </div>

            {/* Flow Details */}
            <div className="grid grid-cols-2 gap-6">
              {/* Source */}
              <div className="backdrop-blur-xl bg-white/5 border border-slate-700/50 rounded-2xl p-8">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Source</h3>
                <div className="bg-slate-800/50 rounded-xl p-4 mb-4 border border-slate-700/50">
                  <p className="text-white font-semibold text-lg">{flow.source_type}</p>
                </div>
                <p className="text-slate-400 text-sm">Configure where data originates from</p>
              </div>

              {/* Destination */}
              <div className="backdrop-blur-xl bg-white/5 border border-slate-700/50 rounded-2xl p-8">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Destination</h3>
                <div className="bg-slate-800/50 rounded-xl p-4 mb-4 border border-slate-700/50">
                  <p className="text-white font-semibold text-lg">{flow.destination_type}</p>
                </div>
                <p className="text-slate-400 text-sm">Configure where data is sent to</p>
              </div>
            </div>

            {/* Security & Info */}
            <div className="grid grid-cols-2 gap-6">
              {/* Encryption */}
              <div className="backdrop-blur-xl bg-white/5 border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-4">
                  <Shield className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Encryption</h3>
                </div>
                <p className={`font-bold text-lg ${flow.encryption_enabled ? 'text-green-400' : 'text-red-400'}`}>
                  {flow.encryption_enabled ? '✓ Enabled' : '✗ Disabled'}
                </p>
                <p className="text-slate-400 text-sm mt-2">
                  {flow.encryption_enabled ? 'Data is encrypted in transit' : 'Data is not encrypted'}
                </p>
              </div>

              {/* Created */}
              <div className="backdrop-blur-xl bg-white/5 border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-4">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Created</h3>
                </div>
                <p className="font-bold text-lg text-white">{new Date(flow.created_at).toLocaleDateString()}</p>
                <p className="text-slate-400 text-sm mt-2">{new Date(flow.created_at).toLocaleTimeString()}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <Link
                href="/dashboard"
                className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-all duration-300 border border-slate-600 hover:border-slate-500 text-center"
              >
                Back to Dashboard
              </Link>
              <button className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg hover:shadow-cyan-500/30">
                Edit Flow
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-slate-400 text-lg">Data flow not found</p>
            <Link href="/dashboard" className="text-cyan-400 hover:text-cyan-300 mt-4 inline-block">
              Return to Dashboard
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
