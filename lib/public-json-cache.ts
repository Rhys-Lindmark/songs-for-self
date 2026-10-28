import { publicAssetUrl } from '@/lib/public-asset-url';

const cache = new Map<string, Promise<unknown>>();

export function loadPublicJson<T>(fileName: string, options: { fetcher?: typeof fetch; pathname?: string } = {}) {
  const pathname = options.pathname ?? window.location.pathname;
  const url = publicAssetUrl(fileName, pathname);
  const existing = cache.get(url);
  if (existing) return existing as Promise<T>;
  const request = (options.fetcher ?? fetch)(url).then(async (response) => {
    if (!response.ok) throw new Error(`${fileName} could not be loaded.`);
    return response.json() as Promise<T>;
  }).catch((cause) => {
    cache.delete(url);
    throw cause;
  });
  cache.set(url, request);
  return request;
}

export function clearPublicJsonCache() {
  cache.clear();
}
