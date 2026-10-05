import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Bot,
  Copy,
  Check,
  Play,
  Sparkles,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VaultFile } from '../types';

interface SkillPlaygroundModalProps {
  skill: VaultFile;
  onClose: () => void;
}

export const SkillPlaygroundModal: React.FC<SkillPlaygroundModalProps> = ({
  skill,
  onClose,
}) => {
  const { frontmatter, content } = skill;
  const role = frontmatter.role || 'Autonomous Assistant';
  const model = frontmatter.model || 'gemini-2.5-flash';

  // Extract input parameters from frontmatter or regex from content {{variable}}
  const frontmatterInputs = Array.isArray(frontmatter.inputs) ? frontmatter.inputs : [];
  const templateVarMatches = Array.from(content.matchAll(/\{\{([a-zA-Z0-9_-]+)\}\}/g)).map(
    (m) => m[1]
  );
  const detectedInputs = Array.from(new Set([...frontmatterInputs, ...templateVarMatches]));

  // Default initial values for common parameters
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'inputs' | 'resolved' | 'output'>('inputs');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionOutput, setExecutionOutput] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const inp of detectedInputs) {
      if (inp.includes('query') || inp.includes('objective')) {
        initial[inp] = 'Investigate state-of-the-art context window management in modern LLM agent pipelines.';
      } else if (inp.includes('source') || inp.includes('article')) {
        initial[inp] = '- arXiv:2408.0123: KV cache compression using hierarchical paging shows 4x speedup.\n- Anthropic Context Compaction Benchmark: Retaining key reasoning markers improves multi-step tool recall by 28%.';
      } else if (inp.includes('code') || inp.includes('snippet')) {
        initial[inp] = 'function processData(items) {\n  let res = [];\n  for(let i=0; i<items.length; i++) {\n    if (items[i].active) res.push(items[i]);\n  }\n  return res;\n}';
      } else if (inp.includes('language')) {
        initial[inp] = 'TypeScript';
      } else {
        initial[inp] = `Sample ${inp} test data for ${skill.name}`;
      }
    }
    setInputValues(initial);
  }, [skill]);

  // Resolve template with current input values
  const resolvePrompt = (): string => {
    // Extract template between ```markdown and ``` or use entire content
    let template = content;
    const templateMatch = content.match(/```(?:markdown)?\r?\n([\s\S]*?)\r?\n```/);
    if (templateMatch) {
      template = templateMatch[1];
    }

    let resolved = template;
    for (const [key, value] of Object.entries(inputValues)) {
      resolved = resolved.replaceAll(`{{${key}}}`, value);
    }
    return resolved;
  };

  const handleRunSimulation = () => {
    setIsExecuting(true);
    setActiveTab('output');
    setExecutionOutput(null);

    // High fidelity simulation respecting the specific agent skill's persona and schema
    setTimeout(() => {
      let mockOutput = '';

      if (skill.name.includes('research')) {
        mockOutput = `### Executive Summary
Context window compaction achieves significant throughput gains (3.2x–4x) by discarding redundant intermediate token representations while maintaining reasoning fidelity for multi-step tool calls.

### Key Discoveries & Benchmarks
- **Hierarchical KV Cache Compression**: Yields a 4x inference speedup with negligible (<1.2%) perplexity degradation on long-horizon reasoning tasks (arXiv:2408.0123).
- **Reasoning Marker Retention**: Pinpointing and caching explicit sub-goal markers delivers a 28% improvement in tool recall compared to sliding-window truncation.

### Critical Limitations & Risks
- **Attention Sinks**: Truncating attention tokens prematurely triggers divergence during recursive agent workflows.
- **Cache Eviction Latency**: Dynamic re-paging introduces unpredictable tail latency (p99 spike of +120ms).

### Recommended Next Action
- Integrate hierarchical eviction with pinned tool definition markers in \`autonomous-research-agent.md\`.`;
      } else if (skill.name.includes('code')) {
        mockOutput = `### 1. Architecture Critique
- **Imperative Loop Overhead**: Uses traditional indexed loop instead of immutable array transformation.
- **Type Deficiency**: Lacks explicit generics and null guards, allowing runtime errors if items contains undefined.

### 2. Refactored Code
\`\`\`typescript
export interface Item {
  id: string;
  active: boolean;
}

export function filterActiveItems<T extends { active: boolean }>(items: readonly T[]): T[] {
  return items.filter((item): item is T => Boolean(item?.active));
}
\`\`\`

### 3. Complexity Delta
- **Time**: $O(n)$ before and after.
- **Space**: $O(k)$ where $k$ is count of active items; memory allocation is halved through native v8 filter optimizations.

### 4. Unit Test Blueprint
- Test empty array returns \`[]\`.
- Test array containing nullish/falsy items handles gracefully without throwing.
- Test array where all items have \`active: false\`.`;
      } else {
        mockOutput = `### Execution Results: ${skill.frontmatter.title || skill.name}
**Persona Activated**: ${role}
**Target Runtime**: ${model}

#### Synthesized Plan
1. **Primary Goal Alignment**: Structured execution plan verified against inputs.
2. **Deterministic Output**: Rules enforced according to markdown operational directives.
3. **Loop Verification**: All milestones formatted with standard markdown checklists for easy PKM tracking.

\`\`\`markdown
- [x] Verified parameter integrity
- [x] Formatted output schemas
- [ ] Next scheduled checkpoint execution
\`\`\``;
      }

      setExecutionOutput(mockOutput);
      setIsExecuting(false);
    }, 900);
  };

  const handleCopyResolvedPrompt = () => {
    navigator.clipboard.writeText(resolvePrompt());
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 md:px-6 md:py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-stone-900 text-base">
                  {frontmatter.title || skill.name}
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {model}
                </span>
              </div>
              <p className="text-xs text-stone-500 font-medium">
                Persona: <strong className="text-stone-700">{role}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-stone-200 px-6 bg-stone-50/50 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('inputs')}
            className={`py-3 px-3 border-b-2 transition-colors ${
              activeTab === 'inputs'
                ? 'border-stone-900 text-stone-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            1. Test Inputs ({detectedInputs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('resolved')}
            className={`py-3 px-3 border-b-2 transition-colors ${
              activeTab === 'resolved'
                ? 'border-stone-900 text-stone-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            2. Assembled Prompt
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('output')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'output'
                ? 'border-stone-900 text-stone-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            3. Agent Output
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* TAB 1: Inputs Form */}
          {activeTab === 'inputs' && (
            <div className="space-y-4">
              <p className="text-stone-600 text-xs">
                Provide test values for the skill's required inputs. These will populate the prompt template
                defined in the markdown spec:
              </p>

              {detectedInputs.length === 0 ? (
                <div className="p-4 border border-stone-200 rounded-lg text-stone-500 italic bg-stone-50">
                  No parameterized inputs (e.g. \`{'{'}{'{'}var{'}'}{'}'}\`) detected in this skill. The prompt will run with its static instructions.
                </div>
              ) : (
                detectedInputs.map((inpKey) => (
                  <div key={inpKey} className="space-y-1">
                    <label className="font-mono font-semibold text-stone-800 flex items-center justify-between">
                      <span>{inpKey}</span>
                      <span className="text-[10px] font-normal text-stone-400">
                        param: {'{{' + inpKey + '}}'}
                      </span>
                    </label>
                    <textarea
                      rows={inpKey.includes('source') || inpKey.includes('code') ? 4 : 2}
                      value={inputValues[inpKey] || ''}
                      onChange={(e) =>
                        setInputValues({ ...inputValues, [inpKey]: e.target.value })
                      }
                      className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-lg font-mono text-xs text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden"
                    />
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: Assembled Prompt */}
          {activeTab === 'resolved' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-stone-500 font-medium">
                  Complete prompt ready for Gemini / LLM Execution:
                </span>
                <button
                  type="button"
                  onClick={handleCopyResolvedPrompt}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-md font-medium"
                >
                  {copiedPrompt ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedPrompt ? 'Copied' : 'Copy Prompt'}
                </button>
              </div>
              <pre className="p-4 bg-stone-950 text-stone-100 rounded-xl font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed border border-stone-800">
                {resolvePrompt()}
              </pre>
            </div>
          )}

          {/* TAB 3: Agent Output */}
          {activeTab === 'output' && (
            <div className="space-y-3">
              {isExecuting ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-stone-500">
                  <RefreshCw className="w-6 h-6 animate-spin text-stone-900" />
                  <p className="font-medium text-xs">Simulating {role} execution...</p>
                </div>
              ) : executionOutput ? (
                <div className="p-5 bg-stone-50 border border-stone-200 rounded-xl">
                  <div className="prose prose-stone max-w-none text-xs leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-3 rounded-lg border border-stone-200 bg-white">
                            <table className="w-full text-left border-collapse text-xs">
                              {children}
                            </table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-stone-100 text-stone-900 border-b border-stone-200 font-semibold">
                            {children}
                          </thead>
                        ),
                        tbody: ({ children }) => (
                          <tbody className="divide-y divide-stone-100 bg-white">
                            {children}
                          </tbody>
                        ),
                        th: ({ children, style, align }: any) => (
                          <th style={style} align={align} className="px-3 py-2 text-stone-800 font-semibold uppercase text-[11px]">
                            {children}
                          </th>
                        ),
                        td: ({ children, style, align }: any) => (
                          <td style={style} align={align} className="px-3 py-2 text-stone-700">
                            {children}
                          </td>
                        ),
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {executionOutput}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-stone-400 space-y-2">
                  <Play className="w-8 h-8 mx-auto opacity-30" />
                  <p>Click "Run Skill Simulation" below to test the agent output.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200 rounded-lg transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-run-skill-sim"
              disabled={isExecuting}
              onClick={handleRunSimulation}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              {isExecuting ? 'Running...' : 'Run Skill Simulation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
