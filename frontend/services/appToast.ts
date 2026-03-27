/**
 * Vanilla DOM toasts (no react-hot-toast, no CustomEvent listeners, no portal timing).
 * Mount target is below CRTOverlay (z-index) — see Layout `ToastMount`.
 */

export const TOAST_MOUNT_ID = 'detective-ml-toast-mount';

const HOST_ID = 'detective-ml-toast-host';
const STACK_ID = 'detective-ml-toast-stack';

const HOST_STYLE_IN_MOUNT = [
  'position:absolute',
  'inset:0',
  'pointer-events:none',
  'z-index:0',
].join(';');

/** Before React mounts the mount div, host stays on body with the same stacking band. */
const HOST_STYLE_BODY = [
  'position:fixed',
  'inset:0',
  'pointer-events:none',
  'z-index:9998',
].join(';');

/**
 * Bottom-right inside the CRT monitor frame: MainContainer padding (--toast-crt-inset) +
 * inner screen edges (same as TopBar / content).
 */
const STACK_STYLE = [
  'position:absolute',
  'bottom:calc(var(--toast-crt-inset, 0px) + var(--screen-edge-bottom, 30px) + 12px)',
  'right:calc(var(--toast-crt-inset, 0px) + var(--screen-edge-horizontal, 80px))',
  'left:auto',
  'top:auto',
  'max-width:min(96vw,420px)',
  'display:flex',
  'flex-direction:column-reverse',
  'gap:8px',
  'align-items:flex-end',
  'pointer-events:none',
].join(';');

type ToastOptions = {
  id?: string;
  duration?: number;
  icon?: string;
  position?: string;
  /** Merged onto the toast node (camelCase keys like marginBottom). */
  style?: Partial<CSSStyleDeclaration> & Record<string, string | number | undefined>;
};

function resolveMessage(message: unknown): string {
  if (typeof message === 'string') return message.trim();
  if (message == null) return '';
  return String(message).trim();
}

const dedupeEl = new Map<string, HTMLElement>();

function removeNode(el: HTMLElement) {
  const id = el.dataset.toastDedupe;
  if (id) dedupeEl.delete(id);
  el.remove();
}

function getToastParent(): HTMLElement {
  return document.getElementById(TOAST_MOUNT_ID) ?? document.body;
}

function migrateHostToMountIfNeeded(): void {
  const mount = document.getElementById(TOAST_MOUNT_ID);
  const host = document.getElementById(HOST_ID);
  if (!mount || !host || host.parentNode === mount) return;
  host.style.cssText = HOST_STYLE_IN_MOUNT;
  mount.appendChild(host);
}

/** Keep host last inside its parent so newer siblings don’t cover it. */
function bumpToastHostToFront(): void {
  const host = document.getElementById(HOST_ID);
  const p = host?.parentNode;
  if (host && (p === document.body || (p as HTMLElement)?.id === TOAST_MOUNT_ID)) {
    p.appendChild(host);
  }
}

function ensureStack(): HTMLElement {
  migrateHostToMountIfNeeded();

  let stack = document.getElementById(STACK_ID) as HTMLElement | null;
  if (stack) {
    stack.style.cssText = STACK_STYLE;
    bumpToastHostToFront();
    return stack;
  }

  const parent = getToastParent();
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('aria-live', 'polite');
  host.style.cssText = parent === document.body ? HOST_STYLE_BODY : HOST_STYLE_IN_MOUNT;

  stack = document.createElement('div');
  stack.id = STACK_ID;
  stack.style.cssText = STACK_STYLE;

  host.appendChild(stack);
  parent.appendChild(host);
  bumpToastHostToFront();
  return stack;
}

function paint(
  variant: 'error' | 'success' | 'blank',
  message: unknown,
  opts?: ToastOptions
) {
  let text = resolveMessage(message);
  if (!text) {
    if (variant === 'error') text = 'Something went wrong.';
    else return;
  }

  if (typeof document === 'undefined') return;

  migrateHostToMountIfNeeded();

  const duration = opts?.duration ?? (variant === 'error' ? 6500 : 4000);
  const dedupeId = opts?.id;

  console.error('[toast]', variant, text.slice(0, 500));

  const stack = ensureStack();

  if (dedupeId) {
    const prev = dedupeEl.get(dedupeId);
    if (prev) removeNode(prev);
  }

  const div = document.createElement('div');
  div.setAttribute('role', 'status');
  div.textContent = text;
  if (dedupeId) {
    div.dataset.toastDedupe = dedupeId;
    dedupeEl.set(dedupeId, div);
  }

  const bg = '#1a1a1a';
  const border = variant === 'error' ? '3px solid #ff4444' : '1px solid #555555';
  const color = variant === 'error' ? '#ff8888' : variant === 'success' ? '#66ff99' : '#eeeeee';

  div.style.cssText = [
    'pointer-events:auto',
    'max-width:min(96vw,420px)',
    'padding:12px 16px',
    'font-family:VT323, ui-monospace, monospace',
    'font-size:18px',
    'line-height:1.35',
    'white-space:pre-wrap',
    'word-break:break-word',
    `background:${bg}`,
    `color:${color}`,
    `border:${border}`,
    'box-shadow:0 4px 24px rgba(0,0,0,0.55)',
  ].join(';');

  if (opts?.style) {
    try {
      Object.assign(div.style, opts.style);
    } catch {
      /* ignore bad style keys */
    }
  }

  stack.appendChild(div);
  bumpToastHostToFront();

  window.setTimeout(() => {
    if (div.isConnected) removeNode(div);
  }, duration);
}

/** Replaces the inline index.html stub once the bundle loads so all callers share one path. */
if (typeof window !== 'undefined') {
  (
    window as Window & {
      __showDetectiveToast?: (v: string, t: string, o?: ToastOptions) => void;
    }
  ).__showDetectiveToast = (variant, text, opts) => {
    const v =
      variant === 'error' || variant === 'success' || variant === 'blank' ? variant : 'blank';
    paint(v, text, opts);
  };
}

type ToastFn = (message: unknown, opts?: ToastOptions) => string;

const toast = Object.assign(
  ((message: unknown, opts?: ToastOptions) => {
    paint('blank', message, opts);
    return '';
  }) as ToastFn,
  {
    error: (message: unknown, opts?: ToastOptions) => {
      paint('error', message, opts);
      return '';
    },
    success: (message: unknown, opts?: ToastOptions) => {
      paint('success', message, opts);
      return '';
    },
    loading: () => '',
    custom: () => '',
    dismiss: () => {},
    dismissAll: () => {},
    remove: () => {},
    removeAll: () => {},
    promise: () => Promise.resolve(),
  }
);

if (typeof window !== 'undefined') {
  (window as unknown as { __detectiveToast?: typeof toast }).__detectiveToast = toast;
}

export default toast;
