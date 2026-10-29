import { contextBridge, ipcRenderer } from 'electron';

const settingsAPI: SettingsAPI = {
  getSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke('get-settings');
  },
  updateSettings(partial: Partial<Omit<AppSettings, 'characters'>>): void {
    ipcRenderer.send('update-settings', partial);
  },
  addCharacters(): Promise<void> {
    return ipcRenderer.invoke('add-characters');
  },
  removeCharacter(id: string): void {
    ipcRenderer.send('remove-character', id);
  },
  setCharacterVisible(id: string, visible: boolean): void {
    ipcRenderer.send('set-character-visible', id, visible);
  },
  onSettingsChanged(callback: (settings: AppSettings) => void): void {
    ipcRenderer.on('settings-changed', (_event, settings: AppSettings) => {
      callback(settings);
    });
  },
};

contextBridge.exposeInMainWorld('settingsAPI', settingsAPI);
