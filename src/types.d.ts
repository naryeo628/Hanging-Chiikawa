type CharacterId = 'chiikawa' | 'hachiware' | 'usagi' | 'momonga';

interface CharacterConfig {
  id: CharacterId;
  image: string;
  size: number;
}

type PinMode = 'desktop' | 'top';

interface AppSettings {
  dragEnabled: boolean;
  reactionsEnabled: boolean;
  autoWalkEnabled: boolean;
  clickThrough: boolean;
  pinMode: PinMode;
  rowStartPercent: number;
  rowSpacing: number;
  stringLength: number;
  characters: Record<CharacterId, boolean>;
}

interface PetAPI {
  setIgnoreMouseEvents(ignore: boolean): void;
  onSettingsChanged(callback: (settings: AppSettings) => void): void;
}

interface SettingsAPI {
  getSettings(): Promise<AppSettings>;
  updateSettings(partial: Partial<AppSettings>): void;
  onSettingsChanged(callback: (settings: AppSettings) => void): void;
}

interface Window {
  petAPI: PetAPI;
  settingsAPI: SettingsAPI;
}
