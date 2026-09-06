import { toast } from 'sonner';

/** Success feedback goes to a toast: it is seen wherever the user scrolled and goes away by itself. */
export function notifySuccess(text: string): void {
  toast.success(text);
}

export function notifyError(text: string): void {
  toast.error(text);
}
