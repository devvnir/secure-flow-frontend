'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewDataFlowPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    source_type: 'csv',
    destination_type: 'database',
    encryption_enabled: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/data-flows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          source_config: {},
          destination_config: {},
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create data flow');
      }

      const data = await response.json();
      router.push(`/dashboard/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flow');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: '20px', maxWidth: '600px' }}>
      <Link href="/dashboard" style={{ color: '#0366d6', marginBottom: '16px', display: 'block' }}>
        ← Back to Dashboard
      </Link>

      <h1>Create New Data Flow</h1>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="card">
        <div>
          <label htmlFor="name">Flow Name *</label>
          <input
            id="name"
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            disabled={loading}
            placeholder="e.g., Customer Data Sync"
          />
        </div>

        <div>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            disabled={loading}
            placeholder="Describe what this data flow does"
            rows={4}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label htmlFor="source_type">Source Type *</label>
            <select
              id="source_type"
              name="source_type"
              value={formData.source_type}
              onChange={handleChange}
              required
              disabled={loading}
            >
              <option value="csv">CSV</option>
              <option value="database">Database</option>
              <option value="api">API</option>
              <option value="file">File</option>
            </select>
          </div>

          <div>
            <label htmlFor="destination_type">Destination Type *</label>
            <select
              id="destination_type"
              name="destination_type"
              value={formData.destination_type}
              onChange={handleChange}
              required
              disabled={loading}
            >
              <option value="database">Database</option>
              <option value="csv">CSV</option>
              <option value="api">API</option>
              <option value="warehouse">Data Warehouse</option>
            </select>
          </div>
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              name="encryption_enabled"
              checked={formData.encryption_enabled}
              onChange={handleChange}
              disabled={loading}
            />
            {' '}Enable Encryption
          </label>
          <small style={{ display: 'block', color: '#666', marginTop: '4px' }}>
            Recommended for sensitive data
          </small>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button type="submit" className="button button-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Flow'}
          </button>
          <Link href="/dashboard" className="button button-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
