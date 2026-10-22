'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

  useEffect(() => {
    const fetchFlows = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) {
          router.push('/login');
          return;
        }

        const response = await fetch('/api/data-flows', {
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

  return (
    <div className="container" style={{ paddingTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1>Data Flows</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href="/dashboard/new" className="button button-primary">
            New Flow
          </Link>
          <button onClick={handleLogout} className="button button-secondary">
            Logout
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p>Loading data flows...</p>
        </div>
      ) : flows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <h2>No data flows yet</h2>
          <p>Create your first data flow to get started.</p>
          <Link href="/dashboard/new" className="button button-primary">
            Create Flow
          </Link>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Source → Destination</th>
              <th>Status</th>
              <th>Encryption</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((flow) => (
              <tr key={flow.id}>
                <td>
                  <strong>{flow.name}</strong>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {flow.description}
                  </div>
                </td>
                <td>
                  {flow.source_type} → {flow.destination_type}
                </td>
                <td>
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor:
                        flow.status === 'active' ? '#d4edda' : '#e2e3e5',
                      color:
                        flow.status === 'active' ? '#155724' : '#383d41',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    {flow.status}
                  </span>
                </td>
                <td>
                  {flow.encryption_enabled ? (
                    <span style={{ color: '#238636' }}>✓ Enabled</span>
                  ) : (
                    <span style={{ color: '#da3633' }}>✗ Disabled</span>
                  )}
                </td>
                <td>{new Date(flow.created_at).toLocaleDateString()}</td>
                <td>
                  <Link
                    href={`/dashboard/${flow.id}`}
                    className="button button-secondary"
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
