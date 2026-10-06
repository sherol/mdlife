import JSZip from 'jszip';
import { VaultFile, FileCategory } from '../types';
import { getInitialVaultFiles } from '../data/initialVault';
import { parseFrontmatter, stringifyWithFrontmatter } from './markdownParser';

const VAULT_STORAGE_KEY = 'md_life_vault_v1';
const UNSAVED_IDS_KEY = 'md_life_vault_unsaved_ids';

export function loadUnsavedFileIds(): Set<string> {
  try {
    const raw = localStorage.getItem(UNSAVED_IDS_KEY);
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
    localStorage.setItem(UNSAVED_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch (err) {
    console.error('Failed to save unsaved file ids:', err);
  }
}

export function loadVaultFiles(): VaultFile[] {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
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
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(files));
  } catch (err) {
    console.error('Failed to save vault files to localStorage:', err);
  }
}

/**
 * Downloads a single markdown file directly in browser
 */
export function exportSingleFile(file: VaultFile): void {
  const blob = new Blob([file.content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name.endsWith('.md') ? file.name : `${file.name}.md`;
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
export function getTemplateForCategory(
  category: FileCategory,
  title: string
): string {
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
`
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
`
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
`
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
`
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
`
      );
  }
}
