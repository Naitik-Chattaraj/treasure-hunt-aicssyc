// Leaflet CDN Dynamic Loader for Next.js Client Components
// Avoids bundle bloat, zero npm conflicts with React 19, zero build friction

/* eslint-disable @typescript-eslint/no-explicit-any */

let leafletPromise: Promise<any> | null = null;

export function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet cannot be loaded on the server'));
  }

  // Already loaded
  if ((window as any).L) {
    return Promise.resolve((window as any).L);
  }

  if (leafletPromise) {
    return leafletPromise;
  }

  leafletPromise = new Promise((resolve, reject) => {
    // 1. Inject Leaflet CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.crossOrigin = '';
      document.head.appendChild(link);
    }

    // 2. Inject Leaflet JS
    const existingScript = document.getElementById('leaflet-js') as HTMLScriptElement | null;
    if (existingScript) {
      if ((window as any).L) {
        resolve((window as any).L);
      } else {
        existingScript.addEventListener('load', () => resolve((window as any).L));
        existingScript.addEventListener('error', () => reject(new Error('Failed to load Leaflet script')));
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'leaflet-js';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.crossOrigin = '';

    script.onload = () => {
      if ((window as any).L) {
        // Fix Leaflet's default icon URLs when loaded dynamically
        delete (window as any).L.Icon.Default.prototype._getIconUrl;
        (window as any).L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });
        resolve((window as any).L);
      } else {
        reject(new Error('Leaflet object window.L is missing'));
      }
    };

    script.onerror = () => {
      // Try secondary CDN fallback if unpkg fails
      const fallbackScript = document.createElement('script');
      fallbackScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
      fallbackScript.async = true;
      fallbackScript.onload = () => {
        if ((window as any).L) {
          resolve((window as any).L);
        } else {
          reject(new Error('Leaflet fallback failed'));
        }
      };
      fallbackScript.onerror = () => reject(new Error('Could not load Leaflet from primary or fallback CDN'));
      document.body.appendChild(fallbackScript);
    };

    document.body.appendChild(script);
  });

  return leafletPromise;
}
