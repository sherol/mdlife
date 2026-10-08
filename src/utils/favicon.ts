/**
 * Ensures the squirrel favicon (black block with white squirrel silhouette)
 * is loaded dynamically and reliably across GitHub Pages (github.io),
 * custom domains, local development, and offline mock environments.
 */
export const SQUIRREL_FAVICON_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIj4KICA8cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgZmlsbD0iIzAwMDAwMCIvPgogIDwhLS0gUHVyZSBXaGl0ZSBTcXVpcnJlbCBTaWxob3VldHRlIG9uIEJsYWNrIEJsb2NrIC0tPgogIDxwYXRoIGZpbGw9IiNGRkZGRkYiIGQ9Ik0gMTk1IDQyNSBDIDE2MCA0MjUgMTMyIDQwMiAxMTUgMzY1IEMgOTIgMzE1IDg1IDI1MCA5NiAxODUgQyAxMDggMTIwIDE0MiA2OCAxOTUgNDggQyAyMjggMzUgMjYyIDQyIDI4NCA2NCBDIDMwNCA4NCAzMDggMTE0IDI5NiAxNDIgQyAyODAgMTgwIDI0OCAyMDggMjI4IDI0MiBDIDIyMiAyNTIgMjI1IDI2NCAyMzUgMjcwIEMgMjQ4IDI1NSAyNjggMjQ0IDI5MCAyMzggQyAyOTUgMjEwIDMwNCAxODAgMzE4IDE1NSBDIDMyNCAxNDQgMzM0IDEzOCAzNDQgMTQyIEMgMzUyIDE0NiAzNTQgMTU4IDM1MCAxNzIgQyAzNjIgMTY4IDM3NiAxNzIgMzg2IDE4MiBDIDQwMiAxOTggNDA4IDIyMiA0MDIgMjQ0IEMgMzk2IDI2MiAzODIgMjc2IDM2NCAyODIgQyAzNzQgMjkwIDM4NCAzMDIgMzg0IDMxNiBDIDM4NCAzMzIgMzcyIDM0NiAzNTUgMzUwIEMgMzQ0IDM1MyAzMzIgMzQ4IDMyNSAzNDAgQyAzMjIgMzU1IDMyMCAzNzAgMzI0IDM4NSBDIDMzMCA0MDUgMzQ0IDQyMCAzNjUgNDI1IEMgMzc1IDQyNyAzODAgNDM1IDM3NiA0NDQgQyAzNzAgNDUyIDM1NiA0NTQgMzQwIDQ1MCBDIDMxMCA0NDIgMjg4IDQyNSAyNzIgNDAyIEMgMjU1IDQxOCAyMzIgNDI1IDIwOCA0MjUgWiBNIDM3MiAzMDAgQyAzODAgMzAwIDM4NiAzMDYgMzg2IDMxNCBDIDM4NiAzMjIgMzgwIDMyOCAzNzIgMzI4IEMgMzY0IDMyOCAzNTggMzIyIDM1OCAzMTQgQyAzNTggMzA2IDM2NCAzMDAgMzcyIDMwMCBaIiAvPgo8L3N2Zz4=';

export function initFavicon(): void {
  if (typeof document === 'undefined') return;

  const ensureLinks = () => {
    const baseHref = import.meta.env.BASE_URL || './';
    const cleanBase = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;

    const faviconPng = `${cleanBase}favicon-32x32.png`;
    const faviconIco = `${cleanBase}favicon.ico`;
    const appleIcon = `${cleanBase}apple-touch-icon.png`;

    const linkConfigs = [
      // Primary embedded data-uri guarantees instantaneous display on GitHub Pages (github.io)
      { rel: 'icon', type: 'image/svg+xml', href: SQUIRREL_FAVICON_DATA_URI },
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
