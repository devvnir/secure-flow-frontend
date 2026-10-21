import { useCallback } from 'react';
import { useAppState } from '../store';
import type { DataFlow, DataFlowFilters } from '../store';

export const useDataFlows = () => {
  const state = useAppState();
  const { dataFlows } = state;

  const fetchFlows = useCallback(async (filters?: DataFlowFilters) => {
    try {
      const queryParams = new URLSearchParams();
      if (filters?.status) queryParams.append('status', filters.status);
      if (filters?.sourceType) queryParams.append('sourceType', filters.sourceType);
      if (filters?.destinationType) queryParams.append('destinationType', filters.destinationType);
      if (filters?.searchTerm) queryParams.append('search', filters.searchTerm);

      const response = await fetch(`/api/data-flows?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${state.auth.token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch data flows');
      }

      const data = await response.json();
      return { success: true, flows: data.flows };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, [state.auth.token]);

  const createFlow = useCallback(async (flow: Omit<DataFlow, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
    try {
      const response = await fetch('/api/data-flows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.auth.token}`,
        },
        body: JSON.stringify(flow),
      });

      if (!response.ok) {
        throw new Error('Failed to create data flow');
      }

      const data = await response.json();
      return { success: true, flow: data.flow };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, [state.auth.token]);

  const updateFlow = useCallback(async (id: string, updates: Partial<DataFlow>) => {
    try {
      const response = await fetch(`/api/data-flows/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.auth.token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update data flow');
      }

      const data = await response.json();
      return { success: true, flow: data.flow };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, [state.auth.token]);

  const deleteFlow = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/data-flows/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.auth.token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete data flow');
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, [state.auth.token]);

  return {
    flows: dataFlows.flows,
    currentFlow: dataFlows.currentFlow,
    loading: dataFlows.loading,
    error: dataFlows.error,
    filters: dataFlows.filters,
    fetchFlows,
    createFlow,
    updateFlow,
    deleteFlow,
  };
};
