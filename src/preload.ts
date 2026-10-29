import { contextBridge, ipcRenderer } from 'electron';

const petAPI: PetAPI = {
  setIgnoreMouseEvents(ignore: boolean): void {
    if (typeof ignore !== 'boolean') {
      return;
    }
    ipcRenderer.send('set-ignore-mouse', ignore);
  },
  onSettingsChanged(callback: (settings: AppSettings) => void): void {
    ipcRenderer.on('settings-changed', (_event, settings: AppSettings) => {
      callback(settings);
    });
  },
  getCharacterImage(id: string): Promise<string | null> {
    return ipcRenderer.invoke('get-character-image', id);
  },
};

contextBridge.exposeInMainWorld('petAPI', petAPI);
