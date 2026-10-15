import React, { useState, useEffect, useId } from 'react';
import { X, Bot, Copy, Check } from 'lucide-react';
import { VaultFile } from '../types';
import { Modal } from './Modal';

interface SkillPlaygroundModalProps {
  skill: VaultFile;
  onClose: () => void;
}

/**
 * Lets the user fill in a skill's template parameters and copy the assembled prompt
 * to paste into the LLM of their choice. (No model is executed from inside the app.)
 */
export const SkillPlaygroundModal: React.FC<SkillPlaygroundModalProps> = ({
  skill,
  onClose,
}) => {
  const { frontmatter, content } = skill;
  const role = frontmatter.role || 'Autonomous Assistant';
  const model = frontmatter.model;
  const titleId = useId();

  // Extract input parameters from frontmatter or regex from content {{variable}}
  const frontmatterInputs = Array.isArray(frontmatter.inputs) ? frontmatter.inputs : [];
  const templateVarMatches = Array.from(content.matchAll(/\{\{([a-zA-Z0-9_-]+)\}\}/g)).map(
    (m) => m[1]
  );
  const detectedInputs = Array.from(new Set([...frontmatterInputs, ...templateVarMatches]));

  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'inputs' | 'resolved'>('inputs');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    setInputValues({});
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
      if (!value) continue;
      resolved = resolved.replaceAll(`{{${key}}}`, value);
    }
    return resolved;
  };

  const handleCopyResolvedPrompt = async () => {
    try {
      await navigator.clipboard.writeText(resolvePrompt());
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  };

  const copyButtonContent = (
    <>
      {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
      {copiedPrompt ? 'Copied' : 'Copy prompt'}
    </>
  );

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
    >
      {/* Modal Header */}
      <div className="p-4 md:px-6 md:py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 id={titleId} className="font-bold text-stone-900 text-base">
                {frontmatter.title || skill.name}
              </h3>
              {model && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {model}
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 font-medium">
              Persona: <strong className="text-stone-700">{role}</strong>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Tabs */}
      <div role="tablist" className="flex items-center border-b border-stone-200 px-6 bg-stone-50/50 text-xs font-medium">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'inputs'}
          onClick={() => setActiveTab('inputs')}
          className={`py-3 px-3 border-b-2 transition-colors ${
            activeTab === 'inputs'
              ? 'border-stone-900 text-stone-900 font-semibold'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          1. Template Inputs ({detectedInputs.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'resolved'}
          onClick={() => setActiveTab('resolved')}
          className={`py-3 px-3 border-b-2 transition-colors ${
            activeTab === 'resolved'
              ? 'border-stone-900 text-stone-900 font-semibold'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          2. Assembled Prompt
        </button>
      </div>

      {/* Modal Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
        {/* TAB 1: Inputs Form */}
        {activeTab === 'inputs' && (
          <div className="space-y-4">
            <p className="text-stone-600 text-xs">
              Provide values for the skill's inputs. They are substituted into the prompt template defined in
              the markdown spec; empty inputs are left as <code className="font-mono">{'{{placeholder}}'}</code>.
            </p>

            {detectedInputs.length === 0 ? (
              <div className="p-4 border border-stone-200 rounded-lg text-stone-500 italic bg-stone-50">
                No parameterized inputs (e.g. <code className="font-mono">{'{{var}}'}</code>) detected in this skill.
                The prompt consists of its static instructions.
              </div>
            ) : (
              detectedInputs.map((inpKey) => {
                const inputId = `${titleId}-input-${inpKey}`;
                return (
                  <div key={inpKey} className="space-y-1">
                    <label
                      htmlFor={inputId}
                      className="font-mono font-semibold text-stone-800 flex items-center justify-between"
                    >
                      <span>{inpKey}</span>
                      <span className="text-[10px] font-normal text-stone-400">
                        param: {'{{' + inpKey + '}}'}
                      </span>
                    </label>
                    <textarea
                      id={inputId}
                      rows={inpKey.includes('source') || inpKey.includes('code') ? 4 : 2}
                      value={inputValues[inpKey] || ''}
                      onChange={(e) => setInputValues({ ...inputValues, [inpKey]: e.target.value })}
                      className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-lg font-mono text-xs text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden"
                    />
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: Assembled Prompt */}
        {activeTab === 'resolved' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-stone-500 font-medium">
                Complete prompt, ready to paste into your LLM of choice:
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

        <button
          type="button"
          id="btn-copy-skill-prompt"
          onClick={handleCopyResolvedPrompt}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors"
        >
          {copyButtonContent}
        </button>
      </div>
    </Modal>
  );
};
