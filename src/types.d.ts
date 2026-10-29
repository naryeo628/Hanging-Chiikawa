interface CharacterEntry {
  id: string;
  name: string;
  file: string;
  visible: boolean;
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
  characters: CharacterEntry[];
}

interface PetAPI {
  setIgnoreMouseEvents(ignore: boolean): void;
  onSettingsChanged(callback: (settings: AppSettings) => void): void;
  getCharacterImage(id: string): Promise<string | null>;
}

interface SettingsAPI {
  getSettings(): Promise<AppSettings>;
  updateSettings(partial: Partial<Omit<AppSettings, 'characters'>>): void;
  addCharacters(): Promise<void>;
  removeCharacter(id: string): void;
  setCharacterVisible(id: string, visible: boolean): void;
  onSettingsChanged(callback: (settings: AppSettings) => void): void;
}

interface Window {
  petAPI: PetAPI;
  settingsAPI: SettingsAPI;
}
