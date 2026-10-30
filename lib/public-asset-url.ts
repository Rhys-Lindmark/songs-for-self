export function publicAssetUrl(fileName: string, pathname = window.location.pathname) {
  const normalizedFile = fileName.replace(/^\/+/, '');
  const basePath = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return `${basePath}${normalizedFile}`;
}

export const MUSIC_API_ORIGIN = 'https://songs-for-self.rhyslindmark.workers.dev';

export function publicApiUrl(route: string, location = window.location) {
  const normalizedRoute = route.replace(/^\/+/, '').replace(/^api\//, '');
  const origin = location.hostname === 'ai.rhyslindmark.com' ? MUSIC_API_ORIGIN : location.origin;
  return `${origin}/api/${normalizedRoute}`;
}
