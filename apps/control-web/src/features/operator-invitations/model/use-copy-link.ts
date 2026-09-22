import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

const COPIED_FEEDBACK_MS = 2_000;

function createFeedbackTimer() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => clearTimeout(timer);
  return {
    bind: () => cancel,
    cancel,
    start: (reset: () => void) => {
      cancel();
      timer = setTimeout(reset, COPIED_FEEDBACK_MS);
    },
  };
}

export function useCopyLink(url: string) {
  const [feedback] = useState(createFeedbackTimer);
  const mutation = useMutation({
    mutationFn: () => navigator.clipboard.writeText(url),
    retry: false,
    gcTime: 0,
    networkMode: 'always',
  });
  return {
    bind: feedback.bind,
    copied: mutation.isSuccess,
    failed: mutation.isError,
    copy: () => {
      if (mutation.isPending) return;
      feedback.cancel();
      mutation.mutate(undefined, {
        onSuccess: () => feedback.start(mutation.reset),
      });
    },
  };
}
