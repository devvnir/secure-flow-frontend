'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Shield, Plus, LogOut, Zap, ChevronDown } from 'lucide-react';

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
      <div ref={dropdownRef} className="relative z-[9999]">
        <button
          onClick={() => setIsOpen(!isOpen)}
          type="button"
          className="w-full bg-white/5 border border-slate-600/30 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/10 transition-all duration-300 hover:bg-white/10 flex items-center justify-between will-change-transform"
        >
          <span>{value}</span>
          <ChevronDown
            className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isOpen && (
          <div className="fixed bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl shadow-2xl backdrop-blur-xl z-[10000] overflow-hidden" style={{
            top: `${(dropdownRef.current?.getBoundingClientRect().bottom || 0) + 8}px`,
            left: `${dropdownRef.current?.getBoundingClientRect().left || 0}px`,
            width: `${dropdownRef.current?.getBoundingClientRect().width || 0}px`,
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
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

export default function DashboardPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<DataFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    source_type: 'CSV',
    destination_type: 'Database',
    encryption_enabled: true,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchFlows = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) {
          router.push('/login');
          return;
        }

        const response = await fetch('http://localhost:8000/api/data-flows', {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.status === 401) {
          localStorage.removeItem('access_token');
          router.push('/login');
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch data flows');
        }

        const data = await response.json();
        setFlows(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data flows');
      } finally {
        setLoading(false);
      }
    };

    fetchFlows();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    router.push('/login');
  };

  const handleCreateFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const token = localStorage.getItem('access_token');

      // Parse JWT to get user ID
      const tokenParts = token?.split('.') || [];
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

      const newFlow = await response.json();
      setFlows([...flows, newFlow]);
      setShowModal(false);
      setFormData({
        name: '',
        description: '',
        source_type: 'CSV',
        destination_type: 'Database',
        encryption_enabled: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flow');
    } finally {
      setSubmitting(false);
    }
  };

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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Secure Flow</h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg hover:shadow-cyan-500/30">
              <Plus className="w-5 h-5" />
              New Flow
            </button>
            <button onClick={handleLogout} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-all duration-300 border border-slate-600 hover:border-slate-500">
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {error && (
          <div className="mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-slate-600 border-t-cyan-400 animate-spin mx-auto mb-4"></div>
              <p className="text-slate-400 text-lg">Loading data flows...</p>
            </div>
          </div>
        ) : flows.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 mb-6 mx-auto">
              <Zap className="w-10 h-10 text-cyan-400" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">No data flows yet</h2>
            <p className="text-slate-400 text-lg mb-8 max-w-md mx-auto">
              Create your first secure data flow to get started. Configure sources, destinations, and encryption settings.
            </p>
            <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-cyan-500/30 text-lg">
              Create Your First Flow
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white">Your Data Flows</h2>
                <p className="text-slate-400 mt-1">{flows.length} active flow{flows.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            <div className="grid gap-6">
              {flows.map((flow) => (
                <div key={flow.id} className="backdrop-blur-xl bg-white/5 border border-slate-700/50 rounded-xl p-6 hover:bg-white/10 hover:border-slate-600/50 transition-all duration-300 group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors">{flow.name}</h3>
                      <p className="text-slate-400 text-sm mt-1">{flow.description}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${getStatusColor(flow.status)} capitalize`}>
                      {flow.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mb-6 py-4 border-t border-b border-slate-700/50">
                    <div className="flex-1 flex items-center gap-3">
                      <div className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{flow.source_type}</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-600" />
                      <div className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{flow.destination_type}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-widest">Encryption</p>
                        <p className={`font-semibold mt-1 ${flow.encryption_enabled ? 'text-green-400' : 'text-red-400'}`}>
                          {flow.encryption_enabled ? '✓ Enabled' : '✗ Disabled'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-widest">Created</p>
                        <p className="text-slate-300 font-semibold mt-1">{new Date(flow.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/${flow.id}`}
                      className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-all duration-300 border border-slate-600 hover:border-slate-500 flex items-center gap-2"
                    >
                      Edit
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modal Overlay */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>

          {/* Modal */}
          <div className="relative bg-gradient-to-br from-slate-900 via-slate-950 to-black border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-lg backdrop-blur-xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-8 border-b border-slate-700/50 flex-shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-white">Create New Data Flow</h2>
                <p className="text-slate-400 text-sm mt-1">Configure source, destination, and security settings</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition flex-shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form id="modal-form" onSubmit={handleCreateFlow} className="p-8 space-y-6 overflow-y-auto flex-1">
              {error && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
                  <p className="text-red-300 text-sm">{error}</p>
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
                  className="w-full bg-white/5 border border-slate-600/30 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:shadow-lg focus:shadow-cyan-500/10 transition-all duration-300 resize-none h-24"
                />
              </div>

              {/* Source & Destination */}
              <div className="grid grid-cols-2 gap-4">
                <CustomDropdown
                  label="Source Type"
                  value={formData.source_type}
                  onChange={(value) => setFormData({ ...formData, source_type: value })}
                  options={['CSV', 'API', 'Database', 'S3']}
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

            </form>

            {/* Buttons - Sticky Footer */}
            <div className="flex gap-3 p-8 border-t border-slate-700/50 flex-shrink-0 bg-gradient-to-t from-slate-950 to-transparent">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-all duration-300 border border-slate-600 hover:border-slate-500"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="modal-form"
                className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
          </div>
        </div>
      )}
    </div>
  );
}
