(function (): void {
  'use strict';

  function byId<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`element not found: ${id}`);
    }
    return el as T;
  }

  const clickThroughEl = byId<HTMLInputElement>('clickThrough');
  const dragEnabledEl = byId<HTMLInputElement>('dragEnabled');
  const reactionsEnabledEl = byId<HTMLInputElement>('reactionsEnabled');
  const autoWalkEnabledEl = byId<HTMLInputElement>('autoWalkEnabled');
  const pinModeDesktopEl = byId<HTMLInputElement>('pinModeDesktop');
  const pinModeTopEl = byId<HTMLInputElement>('pinModeTop');
  const rowStartPercentEl = byId<HTMLInputElement>('rowStartPercent');
  const rowStartPercentValueEl = byId<HTMLElement>('rowStartPercentValue');
  const stringLengthEl = byId<HTMLInputElement>('stringLength');
  const stringLengthValueEl = byId<HTMLElement>('stringLengthValue');
  const rowSpacingEl = byId<HTMLInputElement>('rowSpacing');
  const rowSpacingValueEl = byId<HTMLElement>('rowSpacingValue');

  const characterEls: Record<CharacterId, HTMLInputElement> = {
    chiikawa: byId<HTMLInputElement>('char-chiikawa'),
    hachiware: byId<HTMLInputElement>('char-hachiware'),
    usagi: byId<HTMLInputElement>('char-usagi'),
    momonga: byId<HTMLInputElement>('char-momonga'),
  };

  let applyingRemoteUpdate = false;

  function applySettings(settings: AppSettings): void {
    applyingRemoteUpdate = true;
    clickThroughEl.checked = settings.clickThrough;
    dragEnabledEl.checked = settings.dragEnabled;
    reactionsEnabledEl.checked = settings.reactionsEnabled;
    autoWalkEnabledEl.checked = settings.autoWalkEnabled;
    pinModeDesktopEl.checked = settings.pinMode === 'desktop';
    pinModeTopEl.checked = settings.pinMode === 'top';
    rowStartPercentEl.value = String(settings.rowStartPercent);
    rowStartPercentValueEl.textContent = String(settings.rowStartPercent);
    stringLengthEl.value = String(settings.stringLength);
    stringLengthValueEl.textContent = String(settings.stringLength);
    rowSpacingEl.value = String(settings.rowSpacing);
    rowSpacingValueEl.textContent = String(settings.rowSpacing);
    for (const id of Object.keys(characterEls) as CharacterId[]) {
      characterEls[id].checked = settings.characters[id];
    }
    applyingRemoteUpdate = false;
  }

  function sendUpdate(partial: Partial<AppSettings>): void {
    if (applyingRemoteUpdate) {
      return;
    }
    window.settingsAPI.updateSettings(partial);
  }

  clickThroughEl.addEventListener('change', () => {
    sendUpdate({ clickThrough: clickThroughEl.checked });
  });
  dragEnabledEl.addEventListener('change', () => {
    sendUpdate({ dragEnabled: dragEnabledEl.checked });
  });
  reactionsEnabledEl.addEventListener('change', () => {
    sendUpdate({ reactionsEnabled: reactionsEnabledEl.checked });
  });
  autoWalkEnabledEl.addEventListener('change', () => {
    sendUpdate({ autoWalkEnabled: autoWalkEnabledEl.checked });
  });
  pinModeDesktopEl.addEventListener('change', () => {
    if (pinModeDesktopEl.checked) {
      sendUpdate({ pinMode: 'desktop' });
    }
  });
  pinModeTopEl.addEventListener('change', () => {
    if (pinModeTopEl.checked) {
      sendUpdate({ pinMode: 'top' });
    }
  });
  rowStartPercentEl.addEventListener('input', () => {
    rowStartPercentValueEl.textContent = rowStartPercentEl.value;
    sendUpdate({ rowStartPercent: Number(rowStartPercentEl.value) });
  });
  stringLengthEl.addEventListener('input', () => {
    stringLengthValueEl.textContent = stringLengthEl.value;
    sendUpdate({ stringLength: Number(stringLengthEl.value) });
  });
  rowSpacingEl.addEventListener('input', () => {
    rowSpacingValueEl.textContent = rowSpacingEl.value;
    sendUpdate({ rowSpacing: Number(rowSpacingEl.value) });
  });
  for (const id of Object.keys(characterEls) as CharacterId[]) {
    characterEls[id].addEventListener('change', () => {
      sendUpdate({ characters: { [id]: characterEls[id].checked } as Record<CharacterId, boolean> });
    });
  }

  window.settingsAPI.onSettingsChanged(applySettings);
  window.settingsAPI.getSettings().then(applySettings);
})();
