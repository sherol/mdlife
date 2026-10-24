import React, { useMemo } from 'react';
import { Target, Rocket, Bot, Plus, Calendar, Layers, ChevronRight } from 'lucide-react';
import { VaultFile } from '../types';
import { getTaskProgress } from '../utils/markdownParser';
import { isGoalFile, isProjectFile, isSkillFile } from '../utils/fileKinds';
import { isMarkdownFile } from '../utils/fileFormats';

interface LifeMatrixViewProps {
  files: VaultFile[];
  onSelectFile: (id: string) => void;
  onQuickNewFileInFolder: (folder: string) => void;
}

/** Keyboard activation (Enter / Space) for non-button elements acting as buttons. */
const activateOnKey = (action: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
};

export const LifeMatrixView: React.FC<LifeMatrixViewProps> = ({
  files,
  onSelectFile,
  onQuickNewFileInFolder,
}) => {
  const { goals, projects, skills, progressById } = useMemo(() => {
    const goals = files.filter(isGoalFile);
    // JSON / text files in a project folder are attachments, not project notes
    const projects = files.filter((f) => isProjectFile(f) && isMarkdownFile(f));
    const skills = files.filter(isSkillFile);
    const progressById = new Map(
      [...goals, ...projects].map((f) => [f.id, getTaskProgress(f.content)] as const),
    );
    return { goals, projects, skills, progressById };
  }, [files]);

  return (
    <div className="flex-1 overflow-y-auto bg-stone-50/50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Intro Banner */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                <Layers className="w-3.5 h-3.5 text-stone-700" />
                <span>Life Alignment Architecture</span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                Goals → Projects → Agent Skills Matrix
              </h2>
              <p className="text-sm text-stone-600 mt-1 max-w-3xl">
                Every project exists to deliver a core life goal, and every project can deploy
                specialized agent skills with markdown prompt templates for autonomous execution.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-matrix-new-goal"
                onClick={() => onQuickNewFileInFolder('goals')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Goal
              </button>
              <button
                type="button"
                id="btn-matrix-new-project"
                onClick={() => onQuickNewFileInFolder('projects')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Project
              </button>
            </div>
          </div>
        </div>

        {/* Goals & Driven Projects List */}
        <div className="space-y-6">
          <h3 className="text-base font-semibold text-stone-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-600" />
            Active Goals & Linked Execution
          </h3>

          <div className="grid grid-cols-1 gap-6">
            {goals.map((goal) => {
              const goalProgress = progressById.get(goal.id) ?? getTaskProgress(goal.content);
              const linkedProjects = projects.filter((p) => {
                const goalFilename = goal.name;
                const matchesGoalId =
                  p.frontmatter.goal_id === goalFilename || p.frontmatter.goal_id === goal.path;
                const matchesLinked = goal.frontmatter.linked_projects?.includes(p.name);
                const matchesContent = p.content.includes(`[[${goalFilename}]]`);
                return matchesGoalId || matchesLinked || matchesContent;
              });

              return (
                <div
                  key={goal.id}
                  className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-xs hover:border-stone-300 transition-all"
                >
                  {/* Goal Header */}
                  <div className="p-5 bg-gradient-to-r from-stone-50 to-white border-b border-stone-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-amber-100 text-amber-900 border border-amber-200">
                          Goal
                        </span>
                        {goal.frontmatter.status && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-stone-100 text-stone-700">
                            {goal.frontmatter.status}
                          </span>
                        )}
                        {goal.frontmatter.target_date && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-stone-500 font-mono">
                            <Calendar className="w-3 h-3" />
                            Target: {goal.frontmatter.target_date}
                          </span>
                        )}
                      </div>
                      <h4>
                        <button
                          type="button"
                          onClick={() => onSelectFile(goal.id)}
                          className="text-lg font-bold text-stone-900 hover:text-blue-600 cursor-pointer flex items-center gap-1.5 text-left"
                        >
                          {goal.frontmatter.title || goal.name}
                          <ChevronRight className="w-4 h-4 text-stone-400" />
                        </button>
                      </h4>
                      <p className="text-xs text-stone-500 font-mono">/{goal.path}</p>
                    </div>

                    {/* Goal Checkpoints Progress */}
                    {goalProgress.total > 0 && (
                      <div className="w-48 bg-stone-100 p-2.5 rounded-lg border border-stone-200 shrink-0">
                        <div className="flex justify-between text-xs mb-1 font-medium text-stone-700">
                          <span>Milestones</span>
                          <span>
                            {goalProgress.completed}/{goalProgress.total} ({goalProgress.percentage}
                            %)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 transition-all duration-300"
                            style={{ width: `${goalProgress.percentage}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Linked Projects Section */}
                  <div className="p-5">
                    <div className="text-xs font-semibold uppercase text-stone-400 mb-3 flex items-center gap-1.5">
                      <Rocket className="w-3.5 h-3.5 text-blue-600" />
                      <span>Projects Advancing This Goal ({linkedProjects.length})</span>
                    </div>

                    {linkedProjects.length === 0 ? (
                      <div className="p-4 border border-dashed border-stone-200 rounded-lg text-xs text-stone-500 flex items-center justify-between">
                        <span>No projects currently linked to this goal.</span>
                        <button
                          type="button"
                          onClick={() => onQuickNewFileInFolder('projects')}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          + Create linked project
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {linkedProjects.map((project) => {
                          const projectProgress =
                            progressById.get(project.id) ?? getTaskProgress(project.content);
                          // Determine assigned skills
                          const assignedSkills = skills.filter((s) => {
                            const inFrontmatter = project.frontmatter.assigned_skills?.includes(
                              s.name,
                            );
                            const inContent =
                              project.content.includes(`@${s.name.replace(/\.md$/, '')}`) ||
                              project.content.includes(`[[${s.name}]]`);
                            return inFrontmatter || inContent;
                          });

                          return (
                            <div
                              key={project.id}
                              role="button"
                              tabIndex={0}
                              aria-label={`Open project ${project.frontmatter.title || project.name}`}
                              onClick={() => onSelectFile(project.id)}
                              onKeyDown={activateOnKey(() => onSelectFile(project.id))}
                              className="p-4 rounded-xl border border-stone-200 bg-stone-50/40 hover:bg-white hover:border-stone-300 hover:shadow-xs focus-visible:outline-2 focus-visible:outline-blue-500 transition-all cursor-pointer flex flex-col justify-between group"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase bg-blue-50 text-blue-800 border border-blue-200">
                                    {project.frontmatter.status || 'Project'}
                                  </span>
                                  {project.frontmatter.priority && (
                                    <span className="text-[10px] font-mono text-stone-400 capitalize">
                                      {project.frontmatter.priority}
                                    </span>
                                  )}
                                </div>

                                <h5 className="font-semibold text-stone-900 group-hover:text-blue-600 text-sm mb-1 line-clamp-1">
                                  {project.frontmatter.title || project.name}
                                </h5>
                                <span className="text-[11px] font-mono text-stone-400 block mb-3">
                                  {project.name}
                                </span>

                                {/* Project Checklist Progress */}
                                {projectProgress.total > 0 ? (
                                  <div className="space-y-1 mb-3">
                                    <div className="flex justify-between text-[11px] text-stone-600 font-mono">
                                      <span>Tasks</span>
                                      <span>
                                        {projectProgress.completed}/{projectProgress.total} (
                                        {projectProgress.percentage}%)
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-blue-600 transition-all duration-300"
                                        style={{ width: `${projectProgress.percentage}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-stone-400 mb-3 italic">
                                    No task checkboxes defined
                                  </div>
                                )}
                              </div>

                              {/* Assigned Skills Badges */}
                              <div className="pt-2 border-t border-stone-200/80">
                                <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block mb-1">
                                  Deployed Agent Skills:
                                </span>
                                {assignedSkills.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {assignedSkills.map((s) => (
                                      <button
                                        type="button"
                                        key={s.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onSelectFile(s.id);
                                        }}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-mono cursor-pointer"
                                      >
                                        <Bot className="w-2.5 h-2.5" />@
                                        {s.name.replace(/\.md$/, '')}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-stone-400 italic">
                                    No skills assigned
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Standalone Projects (not tied to any goal) */}
        {projects.filter((p) => !p.frontmatter.goal_id).length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-stone-700 flex items-center gap-2">
              <Rocket className="w-4 h-4 text-stone-400" />
              Independent / Unaligned Initiatives
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {projects
                .filter((p) => !p.frontmatter.goal_id)
                .map((project) => (
                  <div
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open project ${project.frontmatter.title || project.name}`}
                    onClick={() => onSelectFile(project.id)}
                    onKeyDown={activateOnKey(() => onSelectFile(project.id))}
                    className="p-4 rounded-xl border border-stone-200 bg-white hover:border-stone-300 focus-visible:outline-2 focus-visible:outline-blue-500 transition-all cursor-pointer"
                  >
                    <h5 className="font-semibold text-stone-900 text-sm mb-1">
                      {project.frontmatter.title || project.name}
                    </h5>
                    <p className="text-xs text-stone-500 font-mono">/{project.path}</p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
