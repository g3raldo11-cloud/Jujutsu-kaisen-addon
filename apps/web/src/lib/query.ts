import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (n, err: any) => n < 2 && !(err?.status >= 400 && err?.status < 500), refetchOnWindowFocus: false },
  },
});
