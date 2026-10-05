import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Calendar,
  Tag,
  Target,
  Rocket,
  Bot,
  CheckCircle2,
  Copy,
  Check,
  Zap,
  ArrowUpRight,
  ExternalLink,
  FileText,
  Sparkles,
} from 'lucide-react';
import { VaultFile } from '../types';

interface MarkdownPreviewProps {
  file: VaultFile;
  allFiles: VaultFile[];
  onNavigateToFile: (filenameOrPath: string) => void;
  onToggleCheckbox: (index: number) => void;
  onOpenSkillPlayground: (file: VaultFile) => void;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  file,
  allFiles,
  onNavigateToFile,
  onToggleCheckbox,
  onOpenSkillPlayground,
}) => {
  const [copied, setCopied] = useState(false);
  const { frontmatter, content } = file;

  // Strip frontmatter from preview body
  const bodyContent = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

  const isSkill = file.folder === 'skills' || frontmatter.category === 'skills';

  const copyContent = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Helper to extract plain text string from ReactNode (used for heading IDs)
  const getNodeText = (node: React.ReactNode): string => {
    if (node === null || node === undefined) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getNodeText).join('');
    if (React.isValidElement(node) && (node.props as any)?.children) {
      return getNodeText((node.props as any).children);
    }
    return '';
  };

  const slugify = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

  // Preprocess [[WikiLinks]] in markdown content outside code blocks
  const processedContent = useMemo(() => {
    const codeBlockRegex = /(```[\s\S]*?```|`[^`\r\n]*`)/g;
    const parts = bodyContent.split(codeBlockRegex);

    return parts
      .map((part) => {
        // If code block or inline code, leave unchanged
        if (part.startsWith('`')) {
          return part;
        }
        // Replace [[target|alias]] or [[target]]
        return part.replace(/\[\[([^\]\r\n]+)\]\]/g, (_, inner) => {
          const pipeIdx = inner.indexOf('|');
          let target: string;
          let label: string;
          if (pipeIdx !== -1) {
            target = inner.substring(0, pipeIdx).trim();
            label = inner.substring(pipeIdx + 1).trim();
          } else {
            target = inner.trim();
            label = target;
          }
          return `[${label}](wiki:${encodeURIComponent(target)})`;
        });
      })
      .join('');
  }, [bodyContent]);

  let taskCheckboxCounter = 0;

  return (
    <div className="flex-1 overflow-y-auto bg-white p-6 md:p-8 max-w-4xl mx-auto w-full">
      {/* Frontmatter Metadata Card */}
      <div className="mb-6 p-4 rounded-xl bg-stone-50 border border-stone-200">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200/80">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Tag */}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider bg-stone-200 text-stone-800">
              {file.folder === 'goals' && <Target className="w-3 h-3 text-amber-700" />}
              {file.folder === 'projects' && <Rocket className="w-3 h-3 text-blue-700" />}
              {file.folder === 'skills' && <Bot className="w-3 h-3 text-emerald-700" />}
              {file.folder}
            </span>

            {/* Status */}
            {frontmatter.status && (
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium uppercase font-mono ${
                  frontmatter.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : frontmatter.status === 'active' || frontmatter.status === 'in-progress'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-stone-100 text-stone-700 border border-stone-200'
                }`}
              >
                {frontmatter.status}
              </span>
            )}

            {/* Priority */}
            {frontmatter.priority && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium text-stone-600 bg-white border border-stone-200">
                Priority: <strong className="capitalize text-stone-900">{frontmatter.priority}</strong>
              </span>
            )}

            {/* Target Date */}
            {frontmatter.target_date && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-stone-600 bg-white border border-stone-200">
                <Calendar className="w-3 h-3 text-stone-400" />
                {frontmatter.target_date}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isSkill && (
              <button
                type="button"
                id="btn-test-skill-banner"
                onClick={() => onOpenSkillPlayground(file)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                Test Agent Skill
              </button>
            )}

            <button
              type="button"
              id="btn-copy-raw-md"
              onClick={copyContent}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 text-xs font-medium rounded-lg transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-stone-400" />
                  Copy .md
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tags & Skill Attributes */}
        <div className="pt-2.5 flex flex-col gap-2 text-xs">
          {frontmatter.tags && frontmatter.tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Tag className="w-3 h-3 text-stone-400" />
              {frontmatter.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full text-[11px] bg-stone-200/80 text-stone-700 font-mono"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Connected Relationships */}
          {frontmatter.goal_id && (
            <div className="flex items-center gap-1.5 text-stone-600">
              <Target className="w-3.5 h-3.5 text-amber-600" />
              <span>Parent Goal:</span>
              <button
                type="button"
                onClick={() => onNavigateToFile(frontmatter.goal_id!)}
                className="inline-flex items-center gap-0.5 text-blue-600 hover:underline font-mono font-medium"
              >
                {frontmatter.goal_id}
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {frontmatter.linked_projects && frontmatter.linked_projects.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap text-stone-600">
              <Rocket className="w-3.5 h-3.5 text-blue-600" />
              <span>Linked Projects:</span>
              {frontmatter.linked_projects.map((proj) => (
                <button
                  key={proj}
                  type="button"
                  onClick={() => onNavigateToFile(proj)}
                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-mono text-[11px]"
                >
                  {proj}
                  <ArrowUpRight className="w-2.5 h-2.5" />
                </button>
              ))}
            </div>
          )}

          {frontmatter.assigned_skills && frontmatter.assigned_skills.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap text-stone-600">
              <Bot className="w-3.5 h-3.5 text-emerald-600" />
              <span>Assigned Skills:</span>
              {frontmatter.assigned_skills.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => onNavigateToFile(skill)}
                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono text-[11px]"
                >
                  {skill}
                  <ArrowUpRight className="w-2.5 h-2.5" />
                </button>
              ))}
            </div>
          )}

          {/* Skill specifics */}
          {frontmatter.role && (
            <div className="flex items-center gap-1.5 text-stone-700">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-medium">Agent Persona:</span>
              <span>{frontmatter.role}</span>
              {frontmatter.model && (
                <span className="ml-2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-200 text-stone-800">
                  {frontmatter.model}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Rendered Markdown Body with custom components */}
      <div className="prose prose-stone max-w-none text-stone-800 leading-relaxed font-sans">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => {
              const text = getNodeText(children);
              const id = slugify(text);
              return (
                <h1
                  id={id}
                  className="text-2xl font-bold tracking-tight text-stone-950 mt-6 mb-3 pb-2 border-b border-stone-200 scroll-mt-6"
                >
                  {children}
                </h1>
              );
            },
            h2: ({ children }) => {
              const text = getNodeText(children);
              const id = slugify(text);
              return (
                <h2
                  id={id}
                  className="text-xl font-bold tracking-tight text-stone-900 mt-5 mb-2 scroll-mt-6"
                >
                  {children}
                </h2>
              );
            },
            h3: ({ children }) => {
              const text = getNodeText(children);
              const id = slugify(text);
              return (
                <h3
                  id={id}
                  className="text-base font-semibold tracking-tight text-stone-900 mt-4 mb-1.5 scroll-mt-6"
                >
                  {children}
                </h3>
              );
            },
            h4: ({ children }) => {
              const text = getNodeText(children);
              const id = slugify(text);
              return (
                <h4
                  id={id}
                  className="text-sm font-semibold tracking-tight text-stone-900 mt-3 mb-1 scroll-mt-6"
                >
                  {children}
                </h4>
              );
            },
            p: ({ children }) => (
              <p className="my-2.5 text-sm text-stone-700 leading-relaxed">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="my-2 space-y-1 pl-5 list-disc text-sm text-stone-800">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="my-2 space-y-1 pl-5 list-decimal text-sm text-stone-800">{children}</ol>
            ),
            li: ({ children, className, ...props }: any) => {
              const isTaskList =
                className?.includes('task-list-item') ||
                (props.checked !== undefined && props.checked !== null);

              if (isTaskList) {
                return (
                  <li className="list-none -ml-4 flex items-start gap-2 py-0.5 text-sm text-stone-800">
                    {children}
                  </li>
                );
              }
              return <li className="text-sm py-0.5 text-stone-800 leading-relaxed">{children}</li>;
            },
            input: ({ type, checked, ...props }: any) => {
              if (type === 'checkbox') {
                const currentIndex = taskCheckboxCounter++;
                return (
                  <input
                    type="checkbox"
                    checked={Boolean(checked)}
                    onChange={() => onToggleCheckbox(currentIndex)}
                    className="w-4 h-4 mt-0.5 rounded text-stone-900 border-stone-300 focus:ring-stone-500 cursor-pointer align-middle accent-stone-900 shrink-0"
                  />
                );
              }
              return <input type={type} checked={checked} {...props} />;
            },
            del: ({ children }) => (
              <del className="line-through text-stone-400">{children}</del>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-stone-400 pl-4 py-1 italic my-3 text-stone-600 bg-stone-50/70 rounded-r text-sm">
                {children}
              </blockquote>
            ),
            code: ({ children, className }) => {
              const isBlock = className && className.includes('language-');
              if (isBlock) {
                return (
                  <div className="relative group my-3">
                    <pre className="bg-stone-950 text-stone-100 p-3.5 rounded-lg text-xs font-mono overflow-x-auto border border-stone-800">
                      <code>{children}</code>
                    </pre>
                  </div>
                );
              }
              return (
                <code className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-800 font-mono text-xs border border-stone-200">
                  {children}
                </code>
              );
            },
            table: ({ children }) => (
              <div className="overflow-x-auto my-5 rounded-xl border border-stone-200/90 shadow-2xs bg-white">
                <table className="w-full min-w-full text-left border-collapse text-xs md:text-sm">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-stone-100/90 text-stone-900 border-b border-stone-200 font-semibold">
                {children}
              </thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-stone-100 bg-white">
                {children}
              </tbody>
            ),
            tr: ({ children, className }: any) => (
              <tr className={`hover:bg-stone-50/80 transition-colors ${className || ''}`}>
                {children}
              </tr>
            ),
            th: ({ children, style, align, className }: any) => (
              <th
                style={style}
                align={align}
                className={`px-4 py-2.5 text-xs font-semibold text-stone-800 tracking-wider uppercase border-b border-stone-200 ${
                  className || ''
                }`}
              >
                {children}
              </th>
            ),
            td: ({ children, style, align, className }: any) => (
              <td
                style={style}
                align={align}
                className={`px-4 py-2.5 text-xs md:text-sm text-stone-700 align-middle leading-normal ${
                  className || ''
                }`}
              >
                {children}
              </td>
            ),
            a: ({ href, children }) => {
              if (!href) return <span>{children}</span>;

              // 1. Internal Wiki-Link generated from [[WikiLinks]]
              if (href.startsWith('wiki:')) {
                const target = decodeURIComponent(href.slice(5));
                const targetLower = target.toLowerCase();
                const matchedFile = allFiles.find((f) => {
                  return (
                    f.name.toLowerCase() === targetLower ||
                    f.name.toLowerCase() === `${targetLower}.md` ||
                    f.path.toLowerCase() === targetLower ||
                    f.path.toLowerCase() === `${targetLower}.md` ||
                    f.frontmatter.title?.toLowerCase() === targetLower
                  );
                });

                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onNavigateToFile(target);
                    }}
                    title={
                      matchedFile
                        ? `Jump to file: ${matchedFile.name} (${matchedFile.folder})`
                        : `Navigate to: ${target}`
                    }
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-mono font-medium transition-all group align-baseline cursor-pointer ${
                      matchedFile
                        ? 'bg-amber-100/70 hover:bg-amber-200/80 text-amber-950 border border-amber-300/80 hover:shadow-2xs'
                        : 'bg-stone-100 hover:bg-stone-200 text-stone-600 border border-dashed border-stone-300'
                    }`}
                  >
                    <span className="text-amber-600 font-bold select-none text-[11px] group-hover:text-amber-700">
                      [[
                    </span>
                    <span className="font-sans font-medium text-stone-900 group-hover:underline underline-offset-2">
                      {children}
                    </span>
                    <span className="text-amber-600 font-bold select-none text-[11px] group-hover:text-amber-700">
                      ]]
                    </span>
                    <ArrowUpRight className="w-3 h-3 text-amber-700 opacity-60 group-hover:opacity-100 shrink-0" />
                  </button>
                );
              }

              // 2. In-document anchor (#heading-id)
              if (href.startsWith('#')) {
                const anchorId = href.slice(1);
                return (
                  <a
                    href={href}
                    onClick={(e) => {
                      e.preventDefault();
                      const targetEl =
                        document.getElementById(anchorId) ||
                        document.getElementById(slugify(anchorId));
                      if (targetEl) {
                        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      } else {
                        onNavigateToFile(anchorId);
                      }
                    }}
                    className="text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium cursor-pointer"
                  >
                    {children}
                  </a>
                );
              }

              // 3. External web or mailto URL
              const isExternal =
                /^https?:\/\//i.test(href) ||
                /^mailto:/i.test(href) ||
                /^tel:/i.test(href);

              if (isExternal) {
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium cursor-pointer transition-colors group"
                    title={`Open external link: ${href}`}
                  >
                    <span>{children}</span>
                    <ExternalLink className="w-3 h-3 text-blue-500 opacity-70 group-hover:opacity-100 shrink-0 inline ml-0.5" />
                  </a>
                );
              }

              // 4. Internal relative file path (e.g. "goals/ai-systems-mastery.md" or "weekly-review.md")
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const clean = href.replace(/^\.?\//, '');
                    onNavigateToFile(clean);
                  }}
                  className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium cursor-pointer align-baseline"
                  title={`Jump to: ${href}`}
                >
                  <span>{children}</span>
                  <ArrowUpRight className="w-3 h-3 text-blue-500 opacity-60 shrink-0 inline ml-0.5" />
                </button>
              );
            },
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    </div>
  );
};
