export function publicAssetUrl(fileName: string, pathname = window.location.pathname) {
  const normalizedFile = fileName.replace(/^\/+/, '');
  const basePath = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return `${basePath}${normalizedFile}`;
}

export const SITES_API_ORIGIN = 'https://songs-for-self.rhyslindmark.chatgpt.site';

export function publicApiUrl(route: string, location = window.location) {
  const normalizedRoute = route.replace(/^\/+/, '').replace(/^api\//, '');
  const origin = location.hostname === 'ai.rhyslindmark.com' ? SITES_API_ORIGIN : location.origin;
  return `${origin}/api/${normalizedRoute}`;
}
