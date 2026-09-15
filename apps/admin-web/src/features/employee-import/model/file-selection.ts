import { createStore } from 'zustand/vanilla';
import {
  MAX_IMPORT_FILE_BYTES,
  previewEmployees,
  type EmployeePreview,
  type PreviewResult,
} from './preview';

export type ImportReadError =
  Extract<PreviewResult, { status: 'error' }>['error'] | 'READ_FAILED' | 'FILE_TOO_LARGE';
export type FileSelection =
  | { readonly status: 'idle' }
  | { readonly status: 'reading'; readonly fileName: string }
  | { readonly status: 'ready'; readonly fileName: string; readonly preview: EmployeePreview }
  | { readonly status: 'error'; readonly fileName: string; readonly error: ImportReadError };
type ImportFile = Pick<File, 'name' | 'size' | 'text'>;

/** File.text cannot abort; a per-selection identity fences every late success and failure. */
export function createFileSelection() {
  let identity = 0;
  const store = createStore<FileSelection>(() => ({ status: 'idle' }));
  function reset() {
    identity += 1;
    store.setState({ status: 'idle' }, true);
  }
  async function select(file: ImportFile | undefined) {
    reset();
    if (!file) return;
    const owner = identity;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      store.setState({ status: 'error', fileName: file.name, error: 'FILE_TOO_LARGE' }, true);
      return;
    }
    store.setState({ status: 'reading', fileName: file.name }, true);
    try {
      const text = await file.text();
      if (owner !== identity) return;
      store.setState({ ...previewEmployees(text), fileName: file.name }, true);
    } catch {
      if (owner === identity)
        store.setState({ status: 'error', fileName: file.name, error: 'READ_FAILED' }, true);
    }
  }
  return { store, select, reset };
}
