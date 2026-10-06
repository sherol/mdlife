/**
 * Ensures the squirrel favicon is loaded dynamically across GitHub Pages (github.io),
 * custom domains, local development, and offline mock environments.
 */
export function initFavicon(): void {
  if (typeof document === 'undefined') return;

  const ensureLinks = () => {
    const baseHref = import.meta.env.BASE_URL || './';
    const cleanBase = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;

    const faviconSvg = `${cleanBase}favicon.svg`;
    const faviconPng = `${cleanBase}favicon-32x32.png`;
    const faviconIco = `${cleanBase}favicon.ico`;
    const appleIcon = `${cleanBase}apple-touch-icon.png`;

    const linkConfigs = [
      { rel: 'icon', type: 'image/svg+xml', href: faviconSvg },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: faviconPng },
      { rel: 'apple-touch-icon', sizes: '180x180', href: appleIcon },
      { rel: 'shortcut icon', href: faviconIco },
    ];

    linkConfigs.forEach(({ rel, type, sizes, href }) => {
      let el = document.querySelector<HTMLLinkElement>(
        sizes
          ? `link[rel="${rel}"][sizes="${sizes}"]`
          : type
          ? `link[rel="${rel}"][type="${type}"]`
          : `link[rel="${rel}"]`
      );
      if (!el) {
        el = document.createElement('link');
        el.rel = rel;
        if (type) el.type = type;
        if (sizes) el.sizes = sizes;
        document.head.appendChild(el);
      }
      el.href = href;
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureLinks);
  } else {
    ensureLinks();
  }
}
