import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dismissAllAnnouncements,
  dismissAnnouncement,
  getAnnouncements,
} from '../api/endpoints';

const QUERY_KEY = ['announcements', 'whats-new'];

export function useWhatsNew() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await getAnnouncements({ includeDismissed: true });
      return res.data || { announcements: [], unreadCount: 0 };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const items = useMemo(
    () => (Array.isArray(query.data?.announcements) ? query.data.announcements : []),
    [query.data]
  );

  const unread = useMemo(() => items.filter((item) => !item.dismissed), [items]);
  const unreadCount = query.data?.unreadCount ?? unread.length;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  const dismissMutation = useMutation({
    mutationFn: (id) => dismissAnnouncement(id),
    onSuccess: invalidate,
  });

  const dismissAllMutation = useMutation({
    mutationFn: () => dismissAllAnnouncements(),
    onSuccess: invalidate,
  });

  return {
    items,
    unread,
    unreadCount,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    dismiss: (id) => dismissMutation.mutateAsync(id),
    dismissAll: () => dismissAllMutation.mutateAsync(),
    isDismissing: dismissMutation.isPending || dismissAllMutation.isPending,
  };
}

export default useWhatsNew;
