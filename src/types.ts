export type FileCategory = 'goals' | 'projects' | 'skills' | 'notes' | 'archive' | 'custom';

export interface FileFrontmatter {
  title?: string;
  category?: FileCategory;
  status?: 'active' | 'in-progress' | 'planned' | 'completed' | 'on-hold' | 'archived';
  priority?: 'high' | 'medium' | 'low';
  target_date?: string;
  tags?: string[];
  goal_id?: string;
  linked_goals?: string[];
  linked_projects?: string[];
  assigned_skills?: string[];
  // Agent Skill specific frontmatter
  role?: string;
  model?: string;
  inputs?: string[];
  trigger?: string;
  version?: string;
  [key: string]: any;
}

export interface VaultFile {
  id: string; // unique path or uuid, e.g. "goals/ai-mastery.md"
  driveFileId?: string; // Direct Google Drive file ID for in-place updates without duplicating
  driveModifiedTime?: string; // Drive modifiedTime (RFC 3339) last seen when fetched/saved; used for conflict detection
  name: string; // "ai-mastery.md"
  path: string; // "goals/ai-mastery.md"
  folder: string; // "goals"
  content: string; // full markdown including frontmatter
  frontmatter: FileFrontmatter;
  createdAt: number;
  updatedAt: number;
}

export interface TaskProgress {
  total: number;
  completed: number;
  percentage: number;
}

export type ActiveTab = 'editor' | 'matrix' | 'skills-hub';

export type DriveConnectionStatus = 'connected' | 'checking' | 'expired' | 'disconnected';

/** A Drive deletion that could not run yet (offline / expired / failed); retried on reconnect. */
export interface PendingDriveDeletion {
  id: string; // local file id at the time of deletion (folder/name)
  folder: string;
  name: string;
  driveFileId?: string;
  queuedAt: number;
}
