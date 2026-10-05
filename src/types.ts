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

export type ActiveTab = 'editor' | 'matrix' | 'skills-hub' | 'graph';

export type DriveConnectionStatus = 'connected' | 'checking' | 'expired' | 'disconnected';

