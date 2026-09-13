import { API_URL } from '@/api';

export const avatarUrl = (id: string, version: string | null | undefined) =>
  version ? `${API_URL}/admin/employees/${id}/avatar?v=${encodeURIComponent(version)}` : null;
