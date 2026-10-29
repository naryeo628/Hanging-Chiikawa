import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  screen,
  ipcMain,
  dialog,
} from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

type AlwaysOnTopLevel = Parameters<BrowserWindow['setAlwaysOnTop']>[1];

const DEFAULT_SETTINGS: AppSettings = {
  dragEnabled: true,
  reactionsEnabled: true,
  autoWalkEnabled: true,
  clickThrough: true,
  pinMode: process.env.PIN_MODE === 'top' ? 'top' : 'desktop',
  rowStartPercent: 10,
  rowSpacing: 80,
  stringLength: 60,
  characters: [],
};

const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const charactersDir = path.join(app.getPath('userData'), 'characters');

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function sanitizeCharacters(value: unknown): CharacterEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is CharacterEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.id === 'string' &&
      typeof entry.name === 'string' &&
      typeof entry.visible === 'boolean' &&
      typeof entry.file === 'string' &&
      entry.file === path.basename(entry.file) &&
      path.extname(entry.file).toLowerCase() in IMAGE_MIME,
  );
}

function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      characters: sanitizeCharacters(parsed.characters),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(current: AppSettings): void {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2), 'utf-8');
  } catch {
    // 저장 실패는 조용히 무시: 다음 변경 시 다시 시도된다.
  }
}

let settings: AppSettings = loadSettings();

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function applyWindowLevel(): void {
  if (!mainWindow) {
    return;
  }
  if (process.platform !== 'darwin') {
    // 창 레벨 구분은 macOS에서만 동작하므로 다른 OS에서는 항상 위에 둔다.
    mainWindow.setAlwaysOnTop(true);
    return;
  }
  const level = (settings.pinMode === 'top' ? 'floating' : 'desktop') as AlwaysOnTopLevel;
  mainWindow.setAlwaysOnTop(true, level);
}

function broadcastSettings(): void {
  mainWindow?.webContents.send('settings-changed', settings);
  settingsWindow?.webContents.send('settings-changed', settings);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function updateSettings(partial: Partial<AppSettings>): void {
  settings = {
    ...settings,
    ...partial,
  };
  settings.rowStartPercent = clampNumber(settings.rowStartPercent, 0, 90, DEFAULT_SETTINGS.rowStartPercent);
  settings.rowSpacing = clampNumber(settings.rowSpacing, 20, 300, DEFAULT_SETTINGS.rowSpacing);
  settings.stringLength = clampNumber(settings.stringLength, 20, 300, DEFAULT_SETTINGS.stringLength);
  saveSettings(settings);
  applyWindowLevel();
  broadcastSettings();
  refreshTrayMenu();
}

function createWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width } = primaryDisplay.workArea;
  const windowHeight = 480;

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height: windowHeight,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  applyWindowLevel();
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    broadcastSettings();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const fitWindowToDisplay = (): void => {
    const { x: wx, y: wy, width: ww } = screen.getPrimaryDisplay().workArea;
    mainWindow?.setBounds({ x: wx, y: wy, width: ww, height: windowHeight });
  };
  fitWindowToDisplay();
  screen.on('display-metrics-changed', fitWindowToDisplay);
  screen.on('display-added', fitWindowToDisplay);
  screen.on('display-removed', fitWindowToDisplay);
}

function createSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 380,
    height: 720,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '치이카와 펫 설정',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, '..', 'settings.html'));

  settingsWindow.webContents.once('did-finish-load', () => {
    broadcastSettings();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function buildTrayIcon(): Electron.NativeImage {
  // macOS는 🐾 글자로 표시하므로 이미지를 쓰지 않는다.
  if (process.platform === 'darwin') {
    return nativeImage.createEmpty();
  }
  const iconPath = path.join(__dirname, '..', 'assets', 'trayIcon.png');
  return fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
}

function buildTrayMenu(): Menu {
  const loginItemSettings = app.getLoginItemSettings();
  const pinLabel = settings.pinMode === 'top' ? '바탕화면에 붙이기' : '항상 위로 고정';

  return Menu.buildFromTemplate([
    {
      label: '설정 열기',
      click: () => {
        createSettingsWindow();
      },
    },
    { type: 'separator' },
    {
      label: pinLabel,
      visible: process.platform === 'darwin',
      click: () => {
        updateSettings({ pinMode: settings.pinMode === 'top' ? 'desktop' : 'top' });
      },
    },
    {
      label: '로그인 시 자동 실행',
      type: 'checkbox',
      checked: loginItemSettings.openAtLogin,
      click: () => {
        const current = app.getLoginItemSettings();
        app.setLoginItemSettings({ openAtLogin: !current.openAtLogin });
        refreshTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.quit();
      },
    },
  ]);
}

function refreshTrayMenu(): void {
  if (!tray) {
    return;
  }
  tray.setContextMenu(buildTrayMenu());
}

function createTray(): void {
  tray = new Tray(buildTrayIcon());
  tray.setToolTip('HangingPet');
  if (process.platform === 'darwin') {
    tray.setTitle('🐾');
  }
  refreshTrayMenu();
}

ipcMain.on('set-ignore-mouse', (_event, ignore: unknown) => {
  if (typeof ignore !== 'boolean' || !mainWindow) {
    return;
  }
  mainWindow.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
});

ipcMain.handle('get-settings', () => settings);

ipcMain.on('update-settings', (_event, partial: unknown) => {
  if (typeof partial !== 'object' || partial === null) {
    return;
  }
  const { characters: _ignored, ...rest } = partial as Partial<AppSettings>;
  updateSettings(rest);
});

ipcMain.handle('add-characters', async () => {
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  };
  const result = settingsWindow
    ? await dialog.showOpenDialog(settingsWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled) {
    return;
  }
  fs.mkdirSync(charactersDir, { recursive: true });
  const added: CharacterEntry[] = [];
  for (const source of result.filePaths) {
    const ext = path.extname(source).toLowerCase();
    if (!(ext in IMAGE_MIME)) {
      continue;
    }
    const id = crypto.randomUUID();
    const file = id + ext;
    try {
      fs.copyFileSync(source, path.join(charactersDir, file));
    } catch {
      continue;
    }
    added.push({ id, name: path.basename(source, path.extname(source)), file, visible: true });
  }
  if (added.length > 0) {
    updateSettings({ characters: [...settings.characters, ...added] });
  }
});

ipcMain.handle('replace-character-image', async (_event, id: unknown) => {
  const target = settings.characters.find((entry) => entry.id === id);
  if (!target) {
    return;
  }
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  };
  const result = settingsWindow
    ? await dialog.showOpenDialog(settingsWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return;
  }
  const source = result.filePaths[0];
  const ext = path.extname(source).toLowerCase();
  if (!(ext in IMAGE_MIME)) {
    return;
  }
  const file = crypto.randomUUID() + ext;
  fs.mkdirSync(charactersDir, { recursive: true });
  try {
    fs.copyFileSync(source, path.join(charactersDir, file));
  } catch {
    return;
  }
  try {
    fs.unlinkSync(path.join(charactersDir, target.file));
  } catch {
    // 이전 파일이 이미 없어도 교체는 계속한다.
  }
  updateSettings({
    characters: settings.characters.map((entry) => (entry.id === target.id ? { ...entry, file } : entry)),
  });
});

ipcMain.on('remove-character', (_event, id: unknown) => {
  const target = settings.characters.find((entry) => entry.id === id);
  if (!target) {
    return;
  }
  try {
    fs.unlinkSync(path.join(charactersDir, target.file));
  } catch {
    // 파일이 이미 없어도 목록에서는 제거한다.
  }
  updateSettings({ characters: settings.characters.filter((entry) => entry.id !== id) });
});

ipcMain.on('move-character', (_event, id: unknown, offset: unknown) => {
  if (offset !== -1 && offset !== 1) {
    return;
  }
  const from = settings.characters.findIndex((entry) => entry.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= settings.characters.length) {
    return;
  }
  const next = [...settings.characters];
  [next[from], next[to]] = [next[to], next[from]];
  updateSettings({ characters: next });
});

ipcMain.on('set-character-visible', (_event, id: unknown, visible: unknown) => {
  if (typeof visible !== 'boolean') {
    return;
  }
  updateSettings({
    characters: settings.characters.map((entry) => (entry.id === id ? { ...entry, visible } : entry)),
  });
});

ipcMain.handle('get-character-image', (_event, id: unknown): string | null => {
  const target = settings.characters.find((entry) => entry.id === id);
  if (!target) {
    return null;
  }
  try {
    const data = fs.readFileSync(path.join(charactersDir, target.file));
    const mime = IMAGE_MIME[path.extname(target.file).toLowerCase()];
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
});

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
  createWindow();
  createTray();
  createSettingsWindow();
});

app.on('window-all-closed', () => {
  // 트레이 앱으로 유지: 메뉴의 "종료"를 통해서만 종료한다.
});
