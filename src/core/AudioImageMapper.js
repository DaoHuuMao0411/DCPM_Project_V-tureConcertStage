const imageModules = import.meta.glob('../../assets/image/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default'
});

const imageEntries = Object.entries(imageModules).map(([path, url]) => ({
  path,
  url,
  fileName: getFileName(path),
  baseName: normalizeBaseName(getFileName(path))
}));

export function resolveAudioImage(fileName = 'No track selected') {
  const baseName = normalizeBaseName(fileName);
  const exactMatch = imageEntries.find((entry) => entry.baseName === baseName);

  if (exactMatch) {
    return {
      url: exactMatch.url,
      label: exactMatch.fileName,
      source: 'matched'
    };
  }

  const defaultImage = imageEntries.find((entry) => entry.baseName === 'default');
  if (defaultImage) {
    return {
      url: defaultImage.url,
      label: defaultImage.fileName,
      source: 'default'
    };
  }

  return {
    url: '',
    label: `${baseName || 'audio'} placeholder`,
    source: 'placeholder'
  };
}

function getFileName(path) {
  return String(path).split(/[\\/]/).pop() ?? '';
}

function normalizeBaseName(fileName) {
  return String(fileName)
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^/.]+$/, '')
    .trim()
    .toLowerCase();
}
