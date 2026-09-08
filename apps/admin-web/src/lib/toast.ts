import { toast } from 'sonner';

/** Success feedback goes to a toast: it is seen wherever the user scrolled and goes away by itself. */
export function notifySuccess(text: string): void {
  toast.success(text);
}

export function notifyError(text: string): void {
  toast.error(text);
}

/** A pending action that resolves to a message: shows a spinner, then the result or the error. */
export function notifyPromise<T>(
  promise: Promise<T>,
  messages: { loading: string; success: (value: T) => string; error: (error: unknown) => string },
): Promise<T> {
  toast.promise(promise, messages);
  return promise;
}
