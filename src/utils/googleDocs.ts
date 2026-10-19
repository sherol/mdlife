/**
 * Utilities for Google Docs import and Google Picker integration.
 * Fetches Google Docs via Docs API v1 or Drive Export v3,
 * and converts the structural document AST to rich Markdown.
 */

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

export interface GoogleDocMetadata {
  id: string;
  name: string;
  url?: string;
  mimeType?: string;
}

/**
 * Extracts a Google Document ID from a full Docs URL or returns the raw ID.
 * Examples:
 *   https://docs.google.com/document/d/1ABCxyz-123_456/edit#heading=h.abc -> 1ABCxyz-123_456
 *   https://drive.google.com/file/d/1ABCxyz-123_456/view -> 1ABCxyz-123_456
 *   1ABCxyz-123_456 -> 1ABCxyz-123_456
 */
export function extractGoogleDocId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Check for docs.google.com or drive.google.com URLs
  const docUrlMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (docUrlMatch && docUrlMatch[1]) {
    return docUrlMatch[1];
  }

  // Check for ?id= query param
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }

  // Raw alphanumeric ID (Google Docs IDs are typically 25-60 chars)
  if (/^[a-zA-Z0-9_-]{15,100}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Dynamically loads the Google API client script (gapi) and initializes the Picker library.
 */
let pickerLoadPromise: Promise<void> | null = null;

export function loadGooglePickerApi(): Promise<void> {
  if (pickerLoadPromise) return pickerLoadPromise;

  pickerLoadPromise = new Promise((resolve, reject) => {
    // If gapi with picker is already present
    if (window.google?.picker) {
      resolve();
      return;
    }

    const onGapiLoaded = () => {
      if (!window.gapi) {
        reject(new Error('Google API client failed to load'));
        return;
      }
      window.gapi.load('picker', {
        callback: () => {
          if (window.google?.picker) {
            resolve();
          } else {
            reject(new Error('Google Picker library failed to initialize'));
          }
        },
        onerror: () => reject(new Error('Failed to load Google Picker component')),
      });
    };

    if (window.gapi) {
      onGapiLoaded();
      return;
    }

    // Inject script tag
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = onGapiLoaded;
    script.onerror = () => reject(new Error('Failed to load https://apis.google.com/js/api.js'));
    document.head.appendChild(script);
  });

  return pickerLoadPromise;
}

/**
 * Launches the official Google Picker dialog to select a Google Doc.
 */
export interface OpenPickerOptions {
  accessToken: string;
  onDocSelected: (doc: GoogleDocMetadata) => void;
  onCancel?: () => void;
  onError?: (err: Error) => void;
}

export async function openGoogleDocsPicker({
  accessToken,
  onDocSelected,
  onCancel,
  onError,
}: OpenPickerOptions): Promise<void> {
  try {
    await loadGooglePickerApi();

    const google = window.google;
    if (!google?.picker) {
      throw new Error('Google Picker is not available');
    }

    // Determine the safe origin for iframe embedding
    const pickerOrigin =
      window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
        ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
        : window.location.origin;

    // Filter to Google Docs files
    const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS);
    docsView.setMimeTypes('application/vnd.google-apps.document');
    docsView.setMode(google.picker.DocsViewMode.LIST);

    const picker = new google.picker.PickerBuilder()
      .addView(docsView)
      .setOAuthToken(accessToken)
      .setOrigin(pickerOrigin)
      .setTitle('Select a Google Doc to Import into Vault')
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs?.[0];
          if (doc) {
            onDocSelected({
              id: doc.id,
              name: doc.name || 'Untitled Document',
              url: doc.url,
              mimeType: doc.mimeType,
            });
          }
        } else if (data.action === google.picker.Action.CANCEL) {
          if (onCancel) onCancel();
        }
      })
      .build();

    picker.setVisible(true);
  } catch (err: any) {
    console.error('Failed to open Google Picker:', err);
    if (onError) onError(err);
    else throw err;
  }
}

/**
 * Fetches the document from Google Docs API v1 or falls back to Drive export.
 */
export async function fetchGoogleDocData(
  documentId: string,
  accessToken: string
): Promise<{ title: string; markdown: string }> {
  // 1. Try Google Docs API v1
  try {
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (res.ok) {
      const docData = await res.json();
      const title = docData.title || 'Untitled Document';
      const markdown = convertGoogleDocToMarkdown(docData);
      return { title, markdown };
    }
  } catch (err) {
    console.warn('Docs API fetch failed, trying Drive export fallback:', err);
  }

  // 2. Fallback: Google Drive Export endpoint
  const exportRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${documentId}/export?mimeType=text/plain`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!exportRes.ok) {
    let errDetail = 'Failed to fetch Google Document';
    try {
      const errJson = await exportRes.json();
      errDetail = errJson.error?.message || errDetail;
    } catch {
      errDetail = `${exportRes.status} ${exportRes.statusText}`;
    }
    throw new Error(errDetail);
  }

  const plainText = await exportRes.text();

  // Try to get file metadata for title
  let title = 'Google Doc Import';
  try {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${documentId}?fields=name`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (metaRes.ok) {
      const meta = await metaRes.json();
      if (meta.name) title = meta.name;
    }
  } catch {
    // Ignore and keep fallback title
  }

  return {
    title,
    markdown: plainText,
  };
}

/**
 * Converts Google Docs API v1 document JSON representation to clean Markdown.
 */
export function convertGoogleDocToMarkdown(doc: any): string {
  const content = doc?.body?.content;
  if (!Array.isArray(content) || content.length === 0) {
    return '';
  }

  const lines: string[] = [];
  const listsInfo = doc.lists || {};

  for (const element of content) {
    if (element.paragraph) {
      const p = element.paragraph;
      const namedStyle = p.paragraphStyle?.namedStyleType || 'NORMAL_TEXT';
      const bullet = p.bullet;

      let prefix = '';
      if (namedStyle === 'HEADING_1') prefix = '# ';
      else if (namedStyle === 'HEADING_2') prefix = '## ';
      else if (namedStyle === 'HEADING_3') prefix = '### ';
      else if (namedStyle === 'HEADING_4') prefix = '#### ';
      else if (namedStyle === 'HEADING_5') prefix = '##### ';
      else if (namedStyle === 'HEADING_6') prefix = '###### ';
      else if (namedStyle === 'TITLE') prefix = '# ';
      else if (namedStyle === 'SUBTITLE') prefix = '> ';

      if (bullet) {
        const nest = bullet.nestingLevel || 0;
        const indent = '  '.repeat(nest);
        const listDesc = listsInfo[bullet.listId];
        const isOrdered = listDesc?.listProperties?.nestingLevels?.[nest]?.glyphType !== undefined;
        prefix = indent + (isOrdered ? '1. ' : '- ');
      }

      let paragraphText = '';
      if (Array.isArray(p.elements)) {
        for (const elem of p.elements) {
          if (elem.textRun) {
            let text = elem.textRun.content || '';
            const style = elem.textRun.textStyle || {};

            // Trailing newlines should be stripped before formatting and restored after
            const hasTrailingNewline = text.endsWith('\n');
            if (hasTrailingNewline) {
              text = text.slice(0, -1);
            }

            if (text.length > 0) {
              // Code / Monospace font
              const isMono =
                style.weightedFontFamily?.fontFamily?.toLowerCase().includes('mono') ||
                style.weightedFontFamily?.fontFamily?.toLowerCase().includes('consolas') ||
                style.weightedFontFamily?.fontFamily?.toLowerCase().includes('courier');

              if (isMono) {
                text = `\`${text}\``;
              } else {
                if (style.bold && style.italic) {
                  text = `***${text}***`;
                } else if (style.bold) {
                  text = `**${text}**`;
                } else if (style.italic) {
                  text = `*${text}*`;
                }

                if (style.strikethrough) {
                  text = `~~${text}~~`;
                }

                if (style.link?.url) {
                  text = `[${text}](${style.link.url})`;
                }
              }
            }

            paragraphText += text;
            if (hasTrailingNewline && !bullet && !prefix.startsWith('#')) {
              // preserve intentional paragraphs
            }
          }
        }
      }

      if (paragraphText.trim().length === 0 && !prefix) {
        // Blank line
        lines.push('');
      } else {
        lines.push(prefix + paragraphText);
      }
    } else if (element.table) {
      // Convert table to markdown table
      const rows = element.table.tableRows;
      if (Array.isArray(rows) && rows.length > 0) {
        lines.push('');
        let isFirstRow = true;

        for (const row of rows) {
          const cells = row.tableCells || [];
          const cellTexts = cells.map((cell: any) => {
            const cellParas: string[] = [];
            if (Array.isArray(cell.content)) {
              for (const cellElem of cell.content) {
                if (cellElem.paragraph?.elements) {
                  const txt = cellElem.paragraph.elements
                    .map((e: any) => e.textRun?.content || '')
                    .join('')
                    .replace(/\n+/g, ' ')
                    .trim();
                  if (txt) cellParas.push(txt);
                }
              }
            }
            return cellParas.join(' ') || ' ';
          });

          lines.push(`| ${cellTexts.join(' | ')} |`);

          if (isFirstRow) {
            lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
            isFirstRow = false;
          }
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
