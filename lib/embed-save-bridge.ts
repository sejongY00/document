import { isEmbedMode } from './embed-mode';

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

export type EmbedSaveStatus = 'pristine' | 'modified' | 'saved';

let saveRequester: (() => void) | null = null;
let closeRequester: (() => void) | null = null;
let lastSaveRequestAt = 0;
let currentSaveStatus: EmbedSaveStatus = 'pristine';
const SAVE_REQUEST_DEDUPE_MS = 150;
const SAVE_STATUS_BADGE_ID = 'oo-embed-save-status';
const SAVE_STATUS_STYLE_ID = 'oo-embed-save-status-css';
const installedWindows = new WeakSet<Window>();
const mountedStatusBadges = new Set<HTMLElement>();

function formatSaveStatusSuffix(status: EmbedSaveStatus): string {
  if (status === 'modified') return ' - 수정됨';
  if (status === 'saved') return ' - 저장됨';
  return '';
}

function syncMountedSaveStatusBadges(): void {
  const text = formatSaveStatusSuffix(currentSaveStatus);
  for (const badge of mountedStatusBadges) {
    if (!badge.isConnected) {
      mountedStatusBadges.delete(badge);
      continue;
    }
    badge.textContent = text;
    badge.dataset.saveStatus = currentSaveStatus;
  }
}

export function setEmbedSaveStatus(status: EmbedSaveStatus): void {
  currentSaveStatus = status;
  syncMountedSaveStatusBadges();
}

export function mountEmbedSaveStatusBadge(doc: Document | null | undefined): boolean {
  if (!isEmbedMode() || !doc) return false;
  const titleBox = doc.getElementById('id-box-doc-name');
  if (!titleBox) return false;

  if (!doc.getElementById(SAVE_STATUS_STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = SAVE_STATUS_STYLE_ID;
    style.textContent = [
      '.oo-embed-save-status {',
      '  flex: 0 0 auto;',
      '  white-space: pre;',
      '  color: inherit;',
      '  font-size: calc(var(--font-size-base-app-custom, var(--font-size-base, 11px)) + 1px);',
      '  line-height: var(--header-input-line-height, 24px);',
      '  opacity: 0.85;',
      '  padding-right: 6px;',
      '  user-select: none;',
      '  pointer-events: none;',
      '}',
      '.oo-embed-save-status:empty {',
      '  display: none;',
      '}',
    ].join('\n');
    (doc.head || doc.documentElement)?.appendChild(style);
  }

  let badge = doc.getElementById(SAVE_STATUS_BADGE_ID);
  if (!badge) {
    badge = doc.createElement('span');
    badge.id = SAVE_STATUS_BADGE_ID;
    badge.className = 'oo-embed-save-status';
    titleBox.appendChild(badge);
  }
  mountedStatusBadges.add(badge);
  syncMountedSaveStatusBadges();
  return true;
}

export function isApplePlatform(nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined): boolean {
  if (!nav) return false;
  const uaNav = nav as NavigatorWithUAData;
  const platform = uaNav.userAgentData?.platform || nav.platform || '';
  const userAgent = nav.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(platform) || /mac os x|iphone|ipad|ipod/i.test(userAgent);
}

function isSaveKey(event: Pick<KeyboardEvent, 'key' | 'code'>): boolean {
  const key = (event.key || '').toLowerCase();
  return key === 's' || key === 'ㄴ' || event.code === 'KeyS';
}

/** Matches Cmd+S on Apple platforms and Ctrl+S on Windows/Linux. */
export function isPlatformSaveShortcut(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  apple = isApplePlatform(),
): boolean {
  if (event.shiftKey || event.altKey) return false;
  const primary = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return primary && isSaveKey(event);
}

/** Matches Ctrl+S on Apple platforms and Cmd+S on Windows/Linux so the inner editor ignores it. */
export function isWrongPlatformSaveShortcut(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  apple = isApplePlatform(),
): boolean {
  if (event.shiftKey || event.altKey) return false;
  const wrongModifier = apple ? event.ctrlKey && !event.metaKey : event.metaKey && !event.ctrlKey;
  return wrongModifier && isSaveKey(event);
}

export function setEmbedSaveRequester(requester: (() => void) | null): void {
  saveRequester = requester;
}

export function setEmbedCloseRequester(requester: (() => void) | null): void {
  closeRequester = requester;
}

export function requestEmbedSave(): boolean {
  if (!isEmbedMode() || !saveRequester) return false;
  const now = Date.now();
  if (now - lastSaveRequestAt < SAVE_REQUEST_DEDUPE_MS) return true;
  lastSaveRequestAt = now;
  saveRequester();
  return true;
}

export function requestEmbedClose(): boolean {
  if (!isEmbedMode() || !closeRequester) return false;
  closeRequester();
  return true;
}

export function installEmbedSaveShortcut(win: Window): boolean {
  if (!isEmbedMode()) return false;
  if (installedWindows.has(win)) return true;

  win.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (isPlatformSaveShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) requestEmbedSave();
        return;
      }
      if (isWrongPlatformSaveShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );

  installedWindows.add(win);
  return true;
}
