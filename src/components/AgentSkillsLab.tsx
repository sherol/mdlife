import React, { useState } from 'react';
import {
  Bot,
  Sparkles,
  Zap,
  Play,
  Copy,
  Check,
  Edit3,
  Plus,
  Layers,
  ArrowRight,
  Code2,
  Cpu,
} from 'lucide-react';
import { VaultFile } from '../types';

interface AgentSkillsLabProps {
  files: VaultFile[];
  onSelectFile: (id: string) => void;
  onOpenSkillPlayground: (file: VaultFile) => void;
  onQuickNewFileInFolder: (folder: string) => void;
  onLoadStarterSkills?: () => void;
}

export const AgentSkillsLab: React.FC<AgentSkillsLabProps> = ({
  files,
  onSelectFile,
  onOpenSkillPlayground,
  onQuickNewFileInFolder,
  onLoadStarterSkills,
}) => {
  const skills = files.filter((f) => {
    const folderLower = (f.folder || '').toLowerCase();
    const catLower = (f.frontmatter.category || '').toLowerCase();
    const nameLower = (f.name || '').toLowerCase();
    return (
      folderLower === 'skills' ||
      folderLower.startsWith('skills/') ||
      folderLower.includes('skill') ||
      catLower === 'skills' ||
      nameLower.includes('skill')
    );
  });
  const projects = files.filter((f) => {
    const folderLower = (f.folder || '').toLowerCase();
    const catLower = (f.frontmatter.category || '').toLowerCase();
    return (
      folderLower === 'projects' ||
      folderLower.startsWith('projects/') ||
      catLower === 'projects'
    );
  });

  return (
    <div className="flex-1 overflow-y-auto bg-stone-50/50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Lab Header */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1">
              <Bot className="w-4 h-4 text-emerald-600" />
              <span>Agent Capabilities Catalog</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
              Agent Skills & Prompt Templates
            </h2>
            <p className="text-sm text-stone-600 mt-1 max-w-3xl">
              Manage your personal library of autonomous agent skills. Each skill is stored as a portable markdown file
              with structured YAML frontmatter, input definitions, and operational prompt templates.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onLoadStarterSkills && (
              <button
                type="button"
                id="btn-load-starter-skills-top"
                onClick={onLoadStarterSkills}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Load Starter Skills
              </button>
            )}
            <button
              type="button"
              id="btn-create-skill"
              onClick={() => onQuickNewFileInFolder('skills')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Agent Skill
            </button>
          </div>
        </div>

        {/* Skills Grid */}
        {skills.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-8 text-center shadow-xs">
            <Bot className="w-8 h-8 text-stone-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-stone-800">No agent skill files found in your vault</p>
            <p className="text-xs text-stone-500 mt-1 mb-5 max-w-md mx-auto">
              Agent skills are modular prompt templates that can be executed independently or linked to projects.
              Load 4 battle-tested starter skill templates or author your own from scratch.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {onLoadStarterSkills && (
                <button
                  type="button"
                  id="btn-empty-load-starter-skills"
                  onClick={onLoadStarterSkills}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer transition-colors shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  Load 4 Starter Skill Templates
                </button>
              )}
              <button
                type="button"
                id="btn-empty-create-skill"
                onClick={() => onQuickNewFileInFolder('skills')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 cursor-pointer transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Create First Skill File
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {skills.map((skill) => {
            const { frontmatter, content } = skill;
            const role = frontmatter.role || 'Autonomous Assistant';
            const model = frontmatter.model || 'gemini-2.5-flash';
            const inputs = frontmatter.inputs || [];

            // Find projects that reference this skill
            const consumingProjects = projects.filter((p) => {
              return (
                p.frontmatter.assigned_skills?.includes(skill.name) ||
                p.content.includes(`@${skill.name.replace(/\.md$/, '')}`) ||
                p.content.includes(`[[${skill.name}]]`)
              );
            });

            return (
              <div
                key={skill.id}
                className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs hover:shadow-md hover:border-stone-300 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Skill Badge Bar */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <Cpu className="w-2.5 h-2.5" />
                      {model}
                    </span>
                    {frontmatter.version && (
                      <span className="text-[10px] font-mono text-stone-400">
                        v{frontmatter.version}
                      </span>
                    )}
                  </div>

                  {/* Title & Role */}
                  <h3
                    onClick={() => onSelectFile(skill.id)}
                    className="font-bold text-stone-900 hover:text-emerald-700 text-base mb-1 cursor-pointer transition-colors"
                  >
                    {frontmatter.title || skill.name}
                  </h3>
                  <p className="text-xs text-stone-600 font-medium mb-3 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>{role}</span>
                  </p>

                  {/* Inputs schema */}
                  {inputs.length > 0 && (
                    <div className="mb-4 bg-stone-50 p-2.5 rounded-lg border border-stone-100">
                      <span className="text-[10px] uppercase font-semibold text-stone-400 tracking-wider block mb-1.5">
                        Expected Inputs:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {inputs.map((inp: string) => (
                          <span
                            key={inp}
                            className="px-1.5 py-0.5 rounded bg-white text-stone-700 font-mono text-[10px] border border-stone-200"
                          >
                            {inp}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dependent Projects */}
                  <div className="mb-4">
                    <span className="text-[10px] uppercase font-semibold text-stone-400 tracking-wider block mb-1">
                      Powering Projects ({consumingProjects.length}):
                    </span>
                    {consumingProjects.length > 0 ? (
                      <div className="space-y-1">
                        {consumingProjects.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => onSelectFile(p.id)}
                            className="text-xs text-stone-600 hover:text-blue-600 cursor-pointer flex items-center gap-1 truncate"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            <span className="truncate">{p.frontmatter.title || p.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-stone-400 italic">
                        No projects currently linked
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectFile(skill.id)}
                    className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-stone-900 font-medium px-2 py-1 hover:bg-stone-100 rounded"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Spec
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenSkillPlayground(skill)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white shadow-xs transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Test Skill
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        )}

        {/* Skill Specification Guide Card */}
        <div className="bg-stone-900 text-stone-100 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
            <div>
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">
                Standard Spec
              </span>
              <h3 className="text-lg font-bold text-white mt-0.5">
                Markdown-First Agent Architecture
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onQuickNewFileInFolder('skills')}
              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
            >
              + Create New Skill Spec
            </button>
          </div>
          <p className="text-xs text-stone-300 leading-relaxed max-w-3xl mb-4">
            Each skill file follows standard markdown conventions: YAML frontmatter specifies metadata (role,
            model, inputs), followed by markdown headings outlining the operational guidelines, edge cases,
            and parameterized prompt templates wrapped in codeblocks.
          </p>
          <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 font-mono text-xs text-stone-300 overflow-x-auto">
            <span className="text-stone-500">---</span><br />
            <span className="text-amber-300">role</span>: Principal Technical Researcher<br />
            <span className="text-amber-300">model</span>: gemini-2.5-flash<br />
            <span className="text-amber-300">inputs</span>: [query_objective, raw_sources]<br />
            <span className="text-stone-500">---</span><br /><br />
            <span className="text-stone-400"># 🤖 Agent Skill: Research Synthesizer</span><br />
            <span className="text-stone-400">## Operational Rules</span><br />
            <span className="text-stone-400">1. Verify all quantitative claims with citations.</span><br />
            <span className="text-stone-400">2. Generate structured markdown output.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
