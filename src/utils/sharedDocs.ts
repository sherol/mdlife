import { VaultFile } from '../types';
import { splitFrontmatterBlock } from './markdownParser';
import { storageKey } from './storageKeys';
import { mergeThreeWay, normalizeMarkdown, MergeResult } from './docMerge';
import type { SharedDocMeta } from './googleDrive';

/**
 * Notes shared via Google Docs.
 *
 * The Google Doc is the shared master copy: one person edits it in Google Docs, the other in
 * mdlife. The note keeps its frontmatter (status, tags, ...) in the vault .md file only, plus a
 * `google_doc: <id>` line linking it to the doc; only the body is mirrored to the doc.
 *
 * Per note we remember what the doc and the note looked like when they were last in sync
 * (DocSyncState), which makes a proper three-way merge possible when both sides changed.
 */

export const GOOGLE_DOC_KEY = 'google_doc';
const SYNC_STATE_KEY = 'md_doc_sync_v1';

export interface DocSyncState {
  docId: string;
  /** Drive `version` of the doc at the last sync. */
  version: string;
  /** The doc's body (as exported markdown) at the last sync. */
  docBase: string;
  /** The note's body that the doc reflected at the last sync. */
  localBase: string;
  syncedAt: number;
}

// ---------------------------------------------------------------------------
// Note <-> doc link and body helpers
// ---------------------------------------------------------------------------

export function getLinkedDocId(file: VaultFile | null | undefined): string | null {
  const value = file?.frontmatter?.[GOOGLE_DOC_KEY];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getNoteBody(content: string): string {
  return splitFrontmatterBlock(content).body;
}

/** Replaces the note body, keeping its frontmatter block verbatim. */
export function withNoteBody(content: string, body: string): string {
  const { frontmatterBlock } = splitFrontmatterBlock(content);
  const block =
    frontmatterBlock && !frontmatterBlock.endsWith('\n')
      ? `${frontmatterBlock}\n`
      : frontmatterBlock;
  return block + body;
}

/** Sets (or with null, removes) the `google_doc:` line in the note's frontmatter. */
export function setLinkedDocId(content: string, docId: string | null): string {
  const { frontmatterBlock, body } = splitFrontmatterBlock(content);
  const lineRe = new RegExp(`^${GOOGLE_DOC_KEY}:.*(?:\\r?\\n|$)`, 'm');

  if (!frontmatterBlock) {
    return docId ? `---\n${GOOGLE_DOC_KEY}: ${docId}\n---\n${body}` : content;
  }

  const inner = frontmatterBlock.replace(/^---\r?\n/, '').replace(/\r?\n?---\r?\n?$/, '');
  let nextInner = inner.replace(lineRe, '').replace(/\n+$/, '');
  if (docId) nextInner = `${nextInner}${nextInner ? '\n' : ''}${GOOGLE_DOC_KEY}: ${docId}`;
  if (!nextInner.trim()) return body;
  return `---\n${nextInner}\n---\n${body}`;
}

export function getDocTitle(file: VaultFile): string {
  const title = file.frontmatter?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : file.name.replace(/\.md$/i, '');
}

// ---------------------------------------------------------------------------
// Persisted sync state (local to this browser)
// ---------------------------------------------------------------------------

function loadAll(): Record<string, DocSyncState> {
  try {
    const raw = localStorage.getItem(storageKey(SYNC_STATE_KEY));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, DocSyncState>): void {
  try {
    localStorage.setItem(storageKey(SYNC_STATE_KEY), JSON.stringify(all));
  } catch {
    // ignore (quota / private mode): the next sync falls back to "no base" handling
  }
}

export const docSyncStore = {
  get(fileId: string, docId: string): DocSyncState | undefined {
    const state = loadAll()[fileId];
    return state && state.docId === docId ? state : undefined;
  },
  set(fileId: string, state: DocSyncState): void {
    saveAll({ ...loadAll(), [fileId]: state });
  },
  remove(fileId: string): void {
    const all = loadAll();
    if (!(fileId in all)) return;
    delete all[fileId];
    saveAll(all);
  },
  rename(oldId: string, newId: string): void {
    const all = loadAll();
    if (!(oldId in all)) return;
    all[newId] = all[oldId];
    delete all[oldId];
    saveAll(all);
  },
  clear(): void {
    try {
      localStorage.removeItem(storageKey(SYNC_STATE_KEY));
    } catch {
      // ignore
    }
  },
};

// ---------------------------------------------------------------------------
// Sync algorithm (Drive access injected, so it can be unit tested)
// ---------------------------------------------------------------------------

export interface DocApi {
  getMeta(docId: string): Promise<SharedDocMeta | null>;
  exportMarkdown(docId: string): Promise<string>;
  replaceContent(docId: string, markdown: string): Promise<SharedDocMeta>;
}

export type DocSyncOutcome =
  /** Doc deleted, trashed or no longer accessible. */
  | { kind: 'missing' }
  /** Both sides changed the same lines; nothing was written anywhere. */
  | { kind: 'conflict'; merge: MergeResult; localBody: string; remoteBody: string; version: string }
  | {
      kind: 'synced';
      /** New note body when the doc's changes were merged in (undefined = note unchanged). */
      body?: string;
      /** The note body this result was computed from (to detect typing during the sync). */
      localBody: string;
      /** Whether the note's changes were written to the doc. */
      pushed: boolean;
      state: DocSyncState;
    };

/**
 * Brings a note and its Google Doc in sync:
 * 1. If the doc changed since the last sync, merge its changes into the note
 *    (three-way, against the last synced version). Overlapping edits -> 'conflict'.
 * 2. If the note has changes the doc doesn't have yet, write the note body to the doc.
 *
 * `hasUnsavedEdits` matters only when there is no previous sync state (e.g. a new browser):
 * then a note with no local edits simply takes the doc's content.
 */
export async function syncNoteWithDoc(
  docId: string,
  noteContent: string,
  previous: DocSyncState | undefined,
  hasUnsavedEdits: boolean,
  api: DocApi,
): Promise<DocSyncOutcome> {
  const meta = await api.getMeta(docId);
  if (!meta || meta.trashed) return { kind: 'missing' };

  const localBody = normalizeMarkdown(getNoteBody(noteContent));
  const now = Date.now();
  let state: DocSyncState | undefined = previous;
  let working = localBody;

  if (!state || meta.version !== state.version) {
    const remote = normalizeMarkdown(await api.exportMarkdown(docId));

    if (!state) {
      if (remote === localBody || !hasUnsavedEdits) {
        working = remote;
        state = { docId, version: meta.version, docBase: remote, localBase: remote, syncedAt: now };
      } else {
        const merge = mergeThreeWay('', localBody, remote);
        return { kind: 'conflict', merge, localBody, remoteBody: remote, version: meta.version };
      }
    } else if (remote === state.docBase) {
      // Version bumped without a content change (e.g. Docs post-processing our own write).
      state = { ...state, version: meta.version };
    } else if (localBody === state.localBase) {
      // Only the doc changed: take it as is.
      working = remote;
      state = { docId, version: meta.version, docBase: remote, localBase: remote, syncedAt: now };
    } else {
      const merge = mergeThreeWay(state.docBase, localBody, remote);
      if (merge.conflictCount > 0) {
        return { kind: 'conflict', merge, localBody, remoteBody: remote, version: meta.version };
      }
      working = merge.text;
      // The doc now corresponds to `remote`; if the merge added our edits, they still need pushing.
      state = {
        docId,
        version: meta.version,
        docBase: remote,
        localBase: working === remote ? remote : state.localBase,
        syncedAt: now,
      };
    }
  }

  let pushed = false;
  if (working !== state.localBase) {
    const after = await api.replaceContent(docId, working);
    // Record the doc as Google stores it (its markdown export may differ cosmetically from ours).
    const exported = normalizeMarkdown(await api.exportMarkdown(docId));
    state = {
      docId,
      version: after.version,
      docBase: exported,
      localBase: working,
      syncedAt: Date.now(),
    };
    pushed = true;
  }

  return {
    kind: 'synced',
    body: working !== localBody ? working : undefined,
    localBody,
    pushed,
    state: { ...state, syncedAt: Date.now() },
  };
}

/** After a conflict is resolved: the doc is at `remoteBody`/`version`; the note becomes `resolved`. */
export function stateAfterConflictResolution(
  docId: string,
  remoteBody: string,
  version: string,
): DocSyncState {
  return { docId, version, docBase: remoteBody, localBase: remoteBody, syncedAt: Date.now() };
}
