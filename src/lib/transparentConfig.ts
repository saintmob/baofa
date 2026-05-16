export type TransparentSettingsRaw = {
  imageSources?: string[] | string;
  imageOpacities?: Record<string, number>;
  useBlendScreens?: Record<string, boolean>;
  imageScales?: Record<string, number>;
  filterIntensities?: Record<string, number>;
  wobbleAmplitudes?: Record<string, number>;
  wobbleFrequencies?: Record<string, number>;
  opacity?: number | Record<string, number>;
  opacityMap?: Record<string, number>;
  blendScreen?: boolean | Record<string, boolean>;
  mixBlendMode?: string | Record<string, string>;
  scale?: number | Record<string, number>;
  filterIntensity?: number | Record<string, number>;
  currentFilterIntensity?: number | Record<string, number>;
  wobbleAmplitude?: number | Record<string, number>;
  wobbleFrequency?: number | Record<string, number>;
  dropShadow?: string | Record<string, string>;
  glow?: string | Record<string, string>;
  [key: string]: unknown;
};

export type TransparentSettings = {
  imageSources: string[];
  imageOpacities: Record<number, number>;
  useBlendScreens: Record<number, boolean>;
  imageScales: Record<number, number>;
  filterIntensities: Record<number, number>;
  wobbleAmplitudes: Record<number, number>;
  wobbleFrequencies: Record<number, number>;
  dropShadows: Record<number, string>;
  glows: Record<number, string>;
  blendModes: Record<number, string>;
};

export type TransparentStyleConfig = {
  opacity: number;
  scale: number;
  filterIntensity: number;
  useBlendScreen: boolean;
  mixBlendMode: string;
  dropShadow: string;
  glow: string;
  wobbleAmplitude: number;
  wobbleFrequency: number;
};

export const DEFAULT_TRANSPARENT_IMAGE = 'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/1.PNG';
export const DEFAULT_TRANSPARENT_OPACITY = 0.83;
export const DEFAULT_TRANSPARENT_FILTER_INTENSITY = 0.89;
export const DEFAULT_TRANSPARENT_IMAGE_SOURCES = [
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/1.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/17.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/18.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/2.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/3.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/4.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/5.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/6.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/7.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/8.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/9.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/10.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/11.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/19.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/13.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/14.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/15.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/16.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/20.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/21.PNG',
  'https://raw.githubusercontent.com/chenmanqi750-creator/myglb/main/22.PNG',
] as const;

const normalizeIndexMap = <T>(value: any, defaultValue: T): Record<number, T> => {
  const result: Record<number, T> = {};
  if (value === undefined || value === null) return result;

  if (typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, raw]) => {
      const index = Number(key);
      if (!Number.isNaN(index)) {
        result[index] = raw as T;
      }
    });
    return result;
  }

  if (typeof value !== 'object') {
    result[0] = value as T;
  }

  return result;
};

const normalizeBooleanMap = (value: any): Record<number, boolean> => {
  const rawMap = normalizeIndexMap<boolean>(value, false);
  const result: Record<number, boolean> = {};
  Object.entries(rawMap).forEach(([key, item]) => {
    if (typeof item === 'string') {
      result[Number(key)] = item === 'true' || item === 'screen';
    } else {
      result[Number(key)] = Boolean(item);
    }
  });
  return result;
};

const normalizeStringMap = (value: any): Record<number, string> => {
  const rawMap = normalizeIndexMap<string>(value, '');
  const result: Record<number, string> = {};
  Object.entries(rawMap).forEach(([key, item]) => {
    result[Number(key)] = String(item ?? '');
  });
  return result;
};

const normalizeSources = (value: any): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item));
  return [];
};

export const defaultSettings: TransparentSettings = {
  imageSources: [...DEFAULT_TRANSPARENT_IMAGE_SOURCES],
  imageOpacities: { 0: DEFAULT_TRANSPARENT_OPACITY },
  useBlendScreens: { 0: true },
  imageScales: {},
  filterIntensities: { 0: DEFAULT_TRANSPARENT_FILTER_INTENSITY },
  wobbleAmplitudes: {},
  wobbleFrequencies: {},
  dropShadows: {},
  glows: {},
  blendModes: { 0: 'screen' },
};

export const normalizeTransparentSettings = (raw: TransparentSettingsRaw): TransparentSettings => {
  const imageSources = normalizeSources(raw.imageSources ?? raw.imageSources ?? raw['sources'] ?? defaultSettings.imageSources);
  const opacityBase = raw.imageOpacities ?? raw.opacity ?? raw.opacityMap;
  const filterIntensityBase = raw.filterIntensities ?? raw.filterIntensity ?? raw.currentFilterIntensity;
  const scaleBase = raw.imageScales ?? raw.scale;
  const blendScreenBase = raw.useBlendScreens ?? raw.blendScreen;
  const wobbleAmplitudeBase = raw.wobbleAmplitudes ?? raw.wobbleAmplitude;
  const wobbleFrequencyBase = raw.wobbleFrequencies ?? raw.wobbleFrequency;

  return {
    imageSources: imageSources.length > 0 ? imageSources : defaultSettings.imageSources,
    imageOpacities: normalizeIndexMap<number>(opacityBase, 1),
    useBlendScreens: normalizeBooleanMap(blendScreenBase),
    imageScales: normalizeIndexMap<number>(scaleBase, 1),
    filterIntensities: normalizeIndexMap<number>(filterIntensityBase, DEFAULT_TRANSPARENT_FILTER_INTENSITY),
    wobbleAmplitudes: normalizeIndexMap<number>(wobbleAmplitudeBase, 0),
    wobbleFrequencies: normalizeIndexMap<number>(wobbleFrequencyBase, 1),
    dropShadows: normalizeStringMap(raw.dropShadow),
    glows: normalizeStringMap(raw.glow),
    blendModes: normalizeStringMap(raw.mixBlendMode),
  };
};

// Strict migration: only return whitelist visual fields mapped to normalized index maps.
export const migrateToumingVisualSettings = (raw: any) => {
  try {
    // reuse normalization for broad legacy name support
    const normalized = normalizeTransparentSettings(raw as TransparentSettingsRaw);

    // whitelist keys only
    const result: Partial<Pick<TransparentSettings, 'imageOpacities' | 'useBlendScreens' | 'imageScales' | 'filterIntensities' | 'wobbleAmplitudes' | 'wobbleFrequencies'>> = {
      imageOpacities: normalized.imageOpacities,
      useBlendScreens: normalized.useBlendScreens,
      imageScales: normalized.imageScales,
      filterIntensities: normalized.filterIntensities,
      wobbleAmplitudes: normalized.wobbleAmplitudes,
      wobbleFrequencies: normalized.wobbleFrequencies,
    };

    return result;
  } catch (err) {
    console.warn('migrateToumingVisualSettings failed', err);
    return {};
  }
};

export const getTransparentStyleConfig = (settings: TransparentSettings, index: number): TransparentStyleConfig => {
  const useIndex = index % Math.max(1, settings.imageSources.length);

  return {
    opacity: settings.imageOpacities[useIndex] ?? DEFAULT_TRANSPARENT_OPACITY,
    scale: settings.imageScales[useIndex] ?? 1,
    filterIntensity: settings.filterIntensities[useIndex] ?? DEFAULT_TRANSPARENT_FILTER_INTENSITY,
    useBlendScreen: settings.useBlendScreens[useIndex] ?? false,
    mixBlendMode: settings.blendModes[useIndex] || (settings.useBlendScreens[useIndex] ? 'screen' : 'normal'),
    dropShadow: settings.dropShadows[useIndex] || 'drop-shadow(0 0 12px rgba(56, 189, 248, 0.14))',
    glow: settings.glows[useIndex] || '',
    wobbleAmplitude: settings.wobbleAmplitudes[useIndex] ?? 0,
    wobbleFrequency: settings.wobbleFrequencies[useIndex] ?? 1,
  };
};

export const loadTransparentSettings = async (): Promise<TransparentSettings> => {
  try {
    const response = await fetch('/transparent-settings.json');
    if (!response.ok) throw new Error('Transparent settings not found');
    const raw = (await response.json()) as TransparentSettingsRaw;
    return normalizeTransparentSettings(raw);
  } catch (error) {
    console.warn('Failed to load transparent settings:', error);
    return defaultSettings;
  }
};
