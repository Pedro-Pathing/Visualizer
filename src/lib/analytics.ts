// Client-side Google Analytics (GA4) initializer.
// Reads `import.meta.env.VITE_GA_ID` (e.g. G-XXXXXXXX) and injects gtag.js + config.
// Usage: import { initAnalytics } from './lib/analytics'; initAnalytics();

export function initAnalytics() {
  try {
    const gaId = (import.meta as any).env?.VITE_GA_ID || 'G-7V7P1D9M2J';
    const streamId = (import.meta as any).env?.VITE_GA_STREAM_ID || '13151582216';
    if (!gaId) return;

    // Avoid injecting multiple times
    if (document.querySelector(`script[data-ga-id="${gaId}"]`)) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    script.setAttribute('data-ga-id', gaId);
    document.head.appendChild(script);

    // Inline initialization — include stream id as a config parameter if available
    const inline = document.createElement('script');
    inline.setAttribute('data-ga-init', gaId);
    inline.text = `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${gaId}', { 'stream_id': '${streamId}' });`;
    document.head.appendChild(inline);
  } catch (e) {
    // Fail silently — analytics is optional
    // eslint-disable-next-line no-console
    console.warn('initAnalytics failed', e);
  }
}

export default initAnalytics;
