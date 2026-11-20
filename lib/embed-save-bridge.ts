import { isEmbedMode } from './embed-mode';

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

let saveRequester: (() => void) | null = null;
let closeRequester: (() => void) | null = null;
let lastSaveRequestAt = 0;
const SAVE_REQUEST_DEDUPE_MS = 150;
const installedWindows = new WeakSet<Window>();

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
