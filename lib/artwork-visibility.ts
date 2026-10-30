type Listener = (visible: boolean) => void;
const observers = new Map<string, { observer: IntersectionObserver; listeners: Map<Element, Set<Listener>> }>();

/** Share observers across large artwork collections; removed targets retain no callbacks. */
export function observeArtworkVisibility(element: Element, listener: Listener, once = true): () => void {
  if (typeof IntersectionObserver === 'undefined') { listener(true); return () => {}; }
  const key = once ? 'artwork' : 'lane';
  let shared = observers.get(key);
  if (!shared) {
    const listeners = new Map<Element, Set<Listener>>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const callbacks = listeners.get(entry.target);
        if (!callbacks) continue;
        for (const callback of callbacks) callback(entry.isIntersecting);
        if (once && entry.isIntersecting) { observer.unobserve(entry.target); listeners.delete(entry.target); }
      }
    }, { rootMargin: once ? '80px 0px' : '48px 0px' });
    shared = { observer, listeners }; observers.set(key, shared);
  }
  let callbacks = shared.listeners.get(element);
  if (!callbacks) { callbacks = new Set(); shared.listeners.set(element, callbacks); shared.observer.observe(element); }
  callbacks.add(listener);
  return () => {
    callbacks.delete(listener);
    if (!callbacks.size) { shared.listeners.delete(element); shared.observer.unobserve(element); }
  };
}
