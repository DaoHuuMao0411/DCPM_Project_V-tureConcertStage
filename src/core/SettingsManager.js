export const SETTINGS_SCHEMA = {
  mouseSensitivity: {
    defaultValue: 1,
    min: 0.2,
    max: 3
  },
  masterVolume: {
    defaultValue: 0.8,
    min: 0,
    max: 1
  },
  audienceReactionIntensity: {
    defaultValue: 1,
    min: 0,
    max: 2
  },
  lightingIntensity: {
    defaultValue: 1,
    min: 0,
    max: 2
  },
  aScoreLowThreshold: {
    defaultValue: 0.22,
    min: 0.05,
    max: 0.6
  },
  aScoreMediumThreshold: {
    defaultValue: 0.45,
    min: 0.1,
    max: 0.85
  },
  aScoreHighThreshold: {
    defaultValue: 0.72,
    min: 0.2,
    max: 0.98
  },
  beatSensitivity: {
    defaultValue: 1.35,
    min: 0.8,
    max: 2.5
  }
};

export const THRESHOLD_GAP = 0.03;

export class SettingsManager {
  constructor(options = {}) {
    this.storageKey = options.storageKey ?? 'virtual-concert-platform:settings';
    this.storage = options.storage ?? globalThis.localStorage;
    this.settings = this.load();
    this.listeners = new Set();
  }

  getSettings() {
    return { ...this.settings };
  }

  get(key) {
    return this.settings[key];
  }

  set(key, value) {
    if (!SETTINGS_SCHEMA[key]) {
      return;
    }

    const nextSettings = sanitizeSettings({ ...this.settings, [key]: value }, key);
    if (settingsEqual(this.settings, nextSettings)) {
      return;
    }

    this.settings = nextSettings;
    this.save();
    this.notify();
  }

  reset() {
    this.settings = getDefaultSettings();
    this.save();
    this.notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => this.listeners.delete(listener);
  }

  load() {
    const defaults = getDefaultSettings();

    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (!raw) {
        return defaults;
      }

      const parsed = JSON.parse(raw);
      return sanitizeSettings({ ...defaults, ...parsed });
    } catch {
      return defaults;
    }
  }

  save() {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.settings));
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }

  notify() {
    const snapshot = this.getSettings();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export function getDefaultSettings() {
  return Object.fromEntries(
    Object.entries(SETTINGS_SCHEMA).map(([key, definition]) => [key, definition.defaultValue])
  );
}

export function sanitizeSettings(settings, changedKey = null) {
  const defaults = getDefaultSettings();
  const sanitized = Object.fromEntries(
    Object.keys(SETTINGS_SCHEMA).map((key) => [
      key,
      sanitizeSetting(key, settings[key] ?? defaults[key])
    ])
  );

  return sanitizeThresholdOrder(sanitized, changedKey);
}

export function sanitizeSetting(key, value) {
  const definition = SETTINGS_SCHEMA[key];
  if (!definition) {
    return value;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return definition.defaultValue;
  }

  return clamp(numericValue, definition.min, definition.max);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeThresholdOrder(settings, changedKey) {
  const lowKey = 'aScoreLowThreshold';
  const mediumKey = 'aScoreMediumThreshold';
  const highKey = 'aScoreHighThreshold';
  const lowSchema = SETTINGS_SCHEMA[lowKey];
  const mediumSchema = SETTINGS_SCHEMA[mediumKey];
  const highSchema = SETTINGS_SCHEMA[highKey];
  const next = { ...settings };

  if (changedKey === lowKey) {
    next[lowKey] = clamp(next[lowKey], lowSchema.min, Math.min(lowSchema.max, next[mediumKey] - THRESHOLD_GAP));
  } else if (changedKey === mediumKey) {
    next[mediumKey] = clamp(
      next[mediumKey],
      Math.max(mediumSchema.min, next[lowKey] + THRESHOLD_GAP),
      Math.min(mediumSchema.max, next[highKey] - THRESHOLD_GAP)
    );
  } else if (changedKey === highKey) {
    next[highKey] = clamp(next[highKey], Math.max(highSchema.min, next[mediumKey] + THRESHOLD_GAP), highSchema.max);
  } else {
    next[lowKey] = clamp(next[lowKey], lowSchema.min, lowSchema.max);
    next[mediumKey] = clamp(
      next[mediumKey],
      Math.max(mediumSchema.min, next[lowKey] + THRESHOLD_GAP),
      mediumSchema.max
    );
    next[highKey] = clamp(
      next[highKey],
      Math.max(highSchema.min, next[mediumKey] + THRESHOLD_GAP),
      highSchema.max
    );

    if (next[lowKey] >= next[mediumKey]) {
      next[lowKey] = clamp(next[mediumKey] - THRESHOLD_GAP, lowSchema.min, lowSchema.max);
    }
  }

  return next;
}

function settingsEqual(left, right) {
  return Object.keys(SETTINGS_SCHEMA).every((key) => left[key] === right[key]);
}
