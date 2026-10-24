import { docSyncStore } from './sharedDocs';
import { ensureTrailhead, TRAILHEAD_ID } from './trailhead';
import JSZip from 'jszip';
import { VaultFile, FileCategory, PendingDriveDeletion } from '../types';
import { getInitialVaultFiles } from '../data/initialVault';
import { stringifyWithFrontmatter } from './markdownParser';
import { storageKey } from './storageKeys';
import { mimeTypeForFile, normalizeFileName } from './fileFormats';

const VAULT_STORAGE_KEY = 'md_life_vault_v1';
const UNSAVED_IDS_KEY = 'md_life_vault_unsaved_ids';
const PENDING_DELETIONS_KEY = 'md_life_vault_pending_deletions';
const BYPASSED_AUTH_KEY = 'md_vault_bypassed_auth';

const VAULT_SAVE_DEBOUNCE_MS = 500;

export function loadUnsavedFileIds(): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(UNSAVED_IDS_KEY));
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr);
      }
    }
  } catch (err) {
    console.error('Failed to load unsaved file ids:', err);
  }
  return new Set();
}

export function saveUnsavedFileIds(ids: Set<string>): void {
  try {
    localStorage.setItem(storageKey(UNSAVED_IDS_KEY), JSON.stringify(Array.from(ids)));
  } catch (err) {
    console.error('Failed to save unsaved file ids:', err);
  }
}

export function loadPendingDeletions(): PendingDriveDeletion[] {
  try {
    const raw = localStorage.getItem(storageKey(PENDING_DELETIONS_KEY));
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch (err) {
    console.error('Failed to load pending Drive deletions:', err);
  }
  return [];
}

export function savePendingDeletions(items: PendingDriveDeletion[]): void {
  try {
    if (items.length === 0) {
      localStorage.removeItem(storageKey(PENDING_DELETIONS_KEY));
    } else {
      localStorage.setItem(storageKey(PENDING_DELETIONS_KEY), JSON.stringify(items));
    }
  } catch (err) {
    console.error('Failed to save pending Drive deletions:', err);
  }
}

export function loadBypassedAuth(): boolean {
  try {
    return localStorage.getItem(storageKey(BYPASSED_AUTH_KEY)) === 'true';
  } catch {
    return false;
  }
}

export function saveBypassedAuth(bypassed: boolean): void {
  try {
    if (bypassed) {
      localStorage.setItem(storageKey(BYPASSED_AUTH_KEY), 'true');
    } else {
      localStorage.removeItem(storageKey(BYPASSED_AUTH_KEY));
    }
  } catch {
    // ignore
  }
}

export function loadVaultFiles(): VaultFile[] {
  try {
    const raw = localStorage.getItem(storageKey(VAULT_STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Vaults cached before the Trailhead existed get it (local only; Drive reloads add it there).
        // A first-version trailhead/README.md moves to start.md, keeping any unsaved-edit flag.
        const result = ensureTrailhead(parsed);
        if (result.removedLegacy) {
          const unsaved = loadUnsavedFileIds();
          if (unsaved.delete(result.removedLegacy.id)) {
            unsaved.add(TRAILHEAD_ID);
            saveUnsavedFileIds(unsaved);
          }
        }
        return result.files;
      }
    }
  } catch (err) {
    console.error('Failed to parse saved vault, loading defaults:', err);
  }

  const defaults = getInitialVaultFiles();
  saveVaultFiles(defaults);
  return defaults;
}

export function saveVaultFiles(files: VaultFile[]): void {
  cancelScheduledVaultSave();
  try {
    localStorage.setItem(storageKey(VAULT_STORAGE_KEY), JSON.stringify(files));
  } catch (err) {
    console.error('Failed to save vault files to localStorage:', err);
  }
}

// Debounced vault backup: serializing the whole vault on every keystroke is expensive.
let pendingVaultSave: VaultFile[] | null = null;
let vaultSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSaveVaultFiles(files: VaultFile[], delayMs = VAULT_SAVE_DEBOUNCE_MS): void {
  pendingVaultSave = files;
  if (vaultSaveTimer) clearTimeout(vaultSaveTimer);
  vaultSaveTimer = setTimeout(flushScheduledVaultSave, delayMs);
}

/** Immediately writes any debounced vault backup (e.g. on page hide or Ctrl/Cmd+S). */
export function flushScheduledVaultSave(): void {
  const files = pendingVaultSave;
  if (files) saveVaultFiles(files);
}

export function cancelScheduledVaultSave(): void {
  if (vaultSaveTimer) clearTimeout(vaultSaveTimer);
  vaultSaveTimer = null;
  pendingVaultSave = null;
}

/** Removes the cached vault so the next load starts from the starter templates. */
export function clearVaultCache(): void {
  cancelScheduledVaultSave();
  try {
    localStorage.removeItem(storageKey(VAULT_STORAGE_KEY));
  } catch {
    // ignore
  }
}

/** Clears every piece of locally cached vault state (used on sign-out). */
export function clearAllVaultStorage(): void {
  clearVaultCache();
  try {
    localStorage.removeItem(storageKey(UNSAVED_IDS_KEY));
    localStorage.removeItem(storageKey(PENDING_DELETIONS_KEY));
    localStorage.removeItem(storageKey(BYPASSED_AUTH_KEY));
  } catch {
    // ignore
  }
  docSyncStore.clear();
}

/**
 * Downloads a single markdown file directly in browser
 */
export function exportSingleFile(file: VaultFile): void {
  const blob = new Blob([file.content], { type: `${mimeTypeForFile(file.name)};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = normalizeFileName(file.name, file.folder);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Bundles the entire vault into a .ZIP archive with real folders
 */
export async function exportVaultAsZip(files: VaultFile[]): Promise<void> {
  const zip = new JSZip();

  // Group files into their respective folders in the zip
  for (const file of files) {
    // e.g. "goals/ai-mastery.md"
    const filePath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
    zip.file(filePath, file.content);
  }

  // Include a README.md explaining the vault structure
  const readmeContent = `# Markdown Life & Agent Skills Vault

This vault was exported from your Markdown Life & Skills system.

## Folder Organization
- \`/goals/\`: High-level visions, OKRs, target dates, and measurable milestones.
- \`/projects/\`: Tactical initiatives, step-by-step checklists, and assigned agent skills.
- \`/skills/\`: Agent skill specifications (role, model, prompt templates, and triggers).
- \`/notes/\`: Daily logs, review rituals, and scratchpads.

Each file contains structured YAML frontmatter compatible with Obsidian, VS Code, Logseq, and automated AI agent workflows.
`;
  zip.file('README.md', readmeContent);

  const contentBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(contentBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `life-and-skills-vault-${new Date().toISOString().split('T')[0]}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates initial markdown template when creating a new file
 */
export function getTemplateForCategory(category: FileCategory, title: string): string {
  const today = new Date().toISOString().split('T')[0];

  switch (category) {
    case 'goals':
      return stringifyWithFrontmatter(
        {
          title,
          category: 'goals',
          status: 'active',
          priority: 'high',
          target_date: today,
          tags: ['life', 'vision'],
          linked_projects: [],
        },
        `# 🎯 ${title}

> "Define the clear standard of what victory looks like."

## Objective & Vision
Describe the enduring impact, measurable outcome, and why this goal matters.

## Measurable Milestones (OKRs)
- [ ] Milestone 1: Concrete benchmark
- [ ] Milestone 2: Secondary threshold
- [ ] Milestone 3: Mastery achievement

## Linked Projects
- Connect supporting projects using [[project-file-name.md]]

## Agent Skills To Deploy
- Note any \`@skill-name\` that can accelerate execution
`,
      );

    case 'projects':
      return stringifyWithFrontmatter(
        {
          title,
          category: 'projects',
          status: 'in-progress',
          priority: 'medium',
          target_date: today,
          goal_id: '',
          tags: ['execution'],
          assigned_skills: [],
        },
        `# 🚀 ${title}

Parent Goal: [[goal-file-name.md]]

## Project Brief
Clear summary of the project scope, deliverables, and definition of done.

## Action Checklist
- [ ] Task 1: Initial research and outline
- [ ] Task 2: Core implementation milestone
- [ ] Task 3: Quality review and testing
- [ ] Task 4: Final deployment or release

## Assigned Agent Skills
- List \`@skill\` handlers supporting this project

## Notes & Technical Context
Add architecture diagrams, links, or scratchpad decisions here.
`,
      );

    case 'skills':
      return stringifyWithFrontmatter(
        {
          title: `${title} Skill`,
          category: 'skills',
          role: 'Specialized Task Agent',
          model: 'gemini-2.5-flash',
          version: '1.0.0',
          trigger: 'on-demand',
          inputs: ['input_query', 'context_data'],
          tags: ['agent-skill'],
        },
        `# 🤖 Agent Skill: ${title}

## Purpose & Identity
You are an expert agent specialized in this domain. Define your core persona, principles, and capabilities.

## Inputs & Parameters
- \`input_query\`: User request or problem description
- \`context_data\`: Background constraints, facts, or existing files

## Operational Guidelines
1. Focus on deterministic, high-accuracy output.
2. Structure recommendations with actionable next steps.
3. Reject ambiguity by asking clarifying questions or listing assumptions.

## Prompt Template
\`\`\`markdown
You are a {{role}}.
Context:
{{context_data}}

Task:
{{input_query}}

Respond strictly in structured markdown format with clear headings and verified steps.
\`\`\`
`,
      );

    case 'archive':
      return stringifyWithFrontmatter(
        {
          title,
          category: 'archive',
          status: 'archived',
          archived_at: today,
          tags: ['archive'],
        },
        `# 📦 ${title} (Archived)

Archived Date: ${today}

## Retrospective & Final Status
Summarize the outcomes, lessons learned, or reason for preservation.

## Preserved Notes & Historical Deliverables
- Key accomplishment or retrospective artifact
`,
      );

    case 'notes':
    default:
      return stringifyWithFrontmatter(
        {
          title,
          category: 'notes',
          status: 'active',
          tags: ['log'],
        },
        `# 📓 ${title}

Date: ${today}

## Daily Focus & Notes
Capture quick thoughts, meeting notes, reflection loops, and loop closures.

## Quick Tasks
- [ ] Immediate follow-up
- [ ] Triage open questions
`,
      );
  }
}
