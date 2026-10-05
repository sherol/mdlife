import { VaultFile } from '../types';
import { parseFrontmatter } from '../utils/markdownParser';

interface RawInitialFile {
  path: string;
  folder: string;
  name: string;
  content: string;
}

const rawFiles: RawInitialFile[] = [
  // --- GOALS ---
  {
    path: 'goals/ai-systems-mastery.md',
    folder: 'goals',
    name: 'ai-systems-mastery.md',
    content: `---
title: AI Systems Mastery & Agent Architecture
category: goals
status: active
priority: high
target_date: 2026-12-31
tags:
  - tech
  - career
  - artificial-intelligence
linked_projects:
  - autonomous-research-agent.md
  - second-brain-pkm.md
---

# 🎯 AI Systems Mastery & Agent Architecture

> "The measure of intelligence is the ability to orchestrate autonomous tools with clarity and intent."

## Objective
Establish complete proficiency in developing, evaluating, and deploying multi-agent workflows, autonomous tool-use pipelines, and local LLM fine-tuning harnesses.

## Key Outcomes (OKRs)
- [x] Complete in-depth evaluation framework for tool-calling latency and error recovery
- [ ] Build and deploy 3 production-grade agent skills with deterministic output schemas
- [ ] Implement an end-to-end autonomous research agent pipeline [[autonomous-research-agent.md]]
- [ ] Publish 4 technical deep-dives on structured prompt orchestration

## Linked Projects
- [[autonomous-research-agent.md]] - High-throughput multi-agent literature and code synthesizer
- [[second-brain-pkm.md]] - Automated markdown graph indexing and semantic retrieval

## Essential Agent Skills
- \`@research-synthesizer\` for automated paper ingest and literature review
- \`@code-architect\` for validating architectural design patterns
- \`@prompt-evaluator\` for testing robustness against hallucinations

## Review Notes
Q3 checkpoint demonstrated reliable tool calling using standard schema validation. Moving focus to context compression and memory compaction.
`
  },
  {
    path: 'goals/endurance-vitality.md',
    folder: 'goals',
    name: 'endurance-vitality.md',
    content: `---
title: Peak Physical Endurance & Vitality
category: goals
status: active
priority: high
target_date: 2026-11-15
tags:
  - health
  - fitness
  - longevity
linked_projects:
  - half-marathon-sub-1h45.md
---

# 🏃 Peak Physical Endurance & Vitality

## Vision
Build a durable, high-energy physical vessel through disciplined cardiovascular conditioning, zone 2 base training, daily mobility work, and optimized sleep metrics.

## Measurable Milestones
- [x] Establish consistent 45 km weekly running volume baseline
- [x] Complete lactate threshold test and calibrate heart rate training zones
- [ ] Finish Autumn Half Marathon under 1h 45m [[half-marathon-sub-1h45.md]]
- [ ] Maintain consistent 8+ hours sleep opportunity with 85%+ recovery score
- [ ] Zero major overuse injuries across 6-month training cycle

## Associated Projects
- [[half-marathon-sub-1h45.md]] - 16-week periodized progressive training plan

## Agent Skills Utilized
- \`@deep-work-planner\` to schedule training blocks around peak cognitive windows without burnout.
`
  },
  {
    path: 'goals/financial-independence-engine.md',
    folder: 'goals',
    name: 'financial-independence-engine.md',
    content: `---
title: Financial Autonomy & Capital Allocation
category: goals
status: active
priority: medium
target_date: 2027-01-01
tags:
  - finance
  - investing
  - freedom
linked_projects: []
---

# 💎 Financial Autonomy & Capital Allocation

## Core Thesis
Optimize savings rate to 50%+ through intentional living, maintain low-cost diversified global index investments, and build passive SaaS digital cashflow assets.

## Strategic Pillars
- [x] Build automated 6-month emergency cash buffer in high-yield vault
- [x] Maximize annual retirement tax-advantaged accounts
- [ ] Achieve $3,500/month in recurring indie software revenue
- [ ] Automate monthly rebalancing and investment DCA pipelines

## Quarterly Checkpoints
- **Q1**: Portfolio allocation review and expense auditing.
- **Q2**: Tax optimization and corporate entity structuring.
`
  },

  // --- PROJECTS ---
  {
    path: 'projects/autonomous-research-agent/autonomous-research-agent.md',
    folder: 'projects/autonomous-research-agent',
    name: 'autonomous-research-agent.md',
    content: `---
title: Autonomous Research Agent Engine
category: projects
status: in-progress
priority: high
target_date: 2026-10-30
goal_id: ai-systems-mastery.md
tags:
  - agents
  - python
  - automation
assigned_skills:
  - research-synthesizer.md
  - code-architect.md
---

# 🚀 Autonomous Research Agent Engine

Parent Goal: [[ai-systems-mastery.md]]

## Project Summary
Develop a modular agent workflow that accepts a research topic query, searches academic archives and developer docs, synthesizes findings into a structured markdown report, and verifies factual claims.

## Deliverables & Tasks
- [x] Define Markdown input/output schemas for agent report format
- [x] Implement parallel search scraper with domain filtering
- [ ] Connect \`@research-synthesizer\` prompt flow for citation verification
- [ ] Add claim extraction and verification step to eliminate hallucinated references
- [ ] Build automated unit test suite with 25 diverse research queries
- [ ] Export findings into obsidian-compatible linked markdown notes

## Assigned Skills
- **@research-synthesizer**: Handles source ingestion, deduplication, and TL;DR extraction.
- **@code-architect**: Reviews async queue logic and token efficiency bottlenecks.

## Technical Architecture Notes
- Fast token streaming with background task queuing
- Markdown AST validation before saving files to disk
- Cache previous search hits to prevent redundant queries

### Component Pipeline & Latency

| Stage | Module | Target Latency | Status |
| :--- | :--- | :---: | :--- |
| Ingestion | Academic & Web Scraper | < 800ms | Operational |
| Synthesis | \`@research-synthesizer\` | < 1.5s | In Review |
| Verification | Citation & Fact Auditor | < 1.2s | Planned |
| Storage | Obsidian Vault Exporter | < 150ms | Operational |

## External References & Docs
- [Google AI Studio Documentation](https://ai.google.dev)
- [arXiv CS.AI Preprints](https://arxiv.org/list/cs.AI/recent)
- Parent Goal: [[ai-systems-mastery.md]]
`
  },
  {
    path: 'projects/half-marathon-sub-1h45/half-marathon-sub-1h45.md',
    folder: 'projects/half-marathon-sub-1h45',
    name: 'half-marathon-sub-1h45.md',
    content: `---
title: Autumn Half Marathon Sub 1h 45m
category: projects
status: in-progress
priority: medium
target_date: 2026-11-15
goal_id: endurance-vitality.md
tags:
  - running
  - race
  - athletics
assigned_skills:
  - deep-work-planner.md
---

# 🏅 Autumn Half Marathon (Pace 4:58 min/km)

Parent Goal: [[endurance-vitality.md]]

## Race Target
Finish the 21.1 km course in 1 hour 44 minutes 59 seconds or faster (requires steady pace of 4:58/km).

## Training Paces & Split Schedule

| Zone | Workout Type | Target Pace | Target Heart Rate |
| :--- | :--- | :---: | :---: |
| Zone 2 | Aerobic Base / Easy | 5:35 - 5:50 /km | 135 - 148 bpm |
| Zone 3 | Marathon / Steady | 5:10 - 5:20 /km | 149 - 159 bpm |
| Zone 4 | Half Marathon Race Pace | 4:55 - 4:58 /km | 160 - 169 bpm |
| Zone 5 | VO2 Max / 1k Intervals | 4:20 - 4:30 /km | 170+ bpm |

## Training Checklist
- [x] Complete 4-week base aerobic building (Zone 2 volume)
- [x] 15 km progressive pace test run (avg 5:08/km)
- [ ] 18 km long run with 8 km at goal race pace
- [ ] Mid-block 10 km time trial under 47:30
- [ ] Practice race fueling (carbohydrate gels at km 7 and 14)
- [ ] 2-week tapering protocol and race morning checklist

## Recovery & Nutrition
- Post-run protein intake (30g within 45 mins)
- 15-minute daily hip mobility and ankle dorsiflexion routine
- Hydration baseline: 3L water + electrolytes on high humidity days
`
  },
  {
    path: 'projects/second-brain-pkm/second-brain-pkm.md',
    folder: 'projects/second-brain-pkm',
    name: 'second-brain-pkm.md',
    content: `---
title: Markdown Second Brain & Vault Architecture
category: projects
status: in-progress
priority: medium
target_date: 2026-10-15
goal_id: ai-systems-mastery.md
tags:
  - pkm
  - markdown
  - productivity
assigned_skills:
  - prompt-evaluator.md
---

# 🧠 Markdown Second Brain & Vault Architecture

Parent Goal: [[ai-systems-mastery.md]]

## Overview
Design a unified, plain-text markdown file system that bridges human long-term planning with AI agent execution skills.

## Core Milestones
- [x] Standardize YAML frontmatter spec for Goals, Projects, and Skills
- [x] Implement bidirectional wiki-link parser [[Like This]]
- [x] Build interactive task checkbox toggle in rendered preview
- [ ] Add instant zip bundle export for offline Obsidian/VS Code backup
- [ ] Build Agent Skill playground for rapid prompt verification

## Philosophy
- **Zero Lock-In**: Everything is pure, portable Markdown (.md).
- **Executable Prompts**: Agent skills are stored directly alongside life goals so AI can act with complete context.
`
  },

  // --- AGENT SKILLS ---
  {
    path: 'skills/research-synthesizer.md',
    folder: 'skills',
    name: 'research-synthesizer.md',
    content: `---
title: Research Synthesizer Skill
category: skills
role: Autonomous Literature & Data Synthesizer
model: gemini-2.5-flash
version: 1.2.0
trigger: on-demand
inputs:
  - raw_articles
  - query_objective
tags:
  - agent-skill
  - research
  - summarization
---

# 🤖 Agent Skill: Research Synthesizer

## Purpose & Persona
You are an expert investigative research assistant with exceptional analytical clarity. You dissect dense technical documentation, academic papers, and market reports into executive briefings with verified citations.

## Input Parameters
- \`query_objective\`: The specific research hypothesis or technical question to resolve.
- \`raw_sources\`: Markdown or text excerpts from relevant articles.

## Execution Rules
1. **Source Attribution**: Never state a claim without citing which input source or reference it originated from.
2. **Contradiction Highlighting**: Explicitly surface when two sources disagree on benchmarks or methodology.
3. **Structured Output**: Always produce outputs conforming to the markdown schema below.

## Prompt Template
\`\`\`markdown
You are a Principal Technical Researcher. Given the following research question:
"{{query_objective}}"

Analyze the provided literature:
{{raw_sources}}

Provide your findings in this exact format:
### Executive Summary
[High-impact 2-sentence synthesis]

### Key Discoveries & Benchmarks
- Bullet point with source evidence
- Quantitative metrics where available

### Critical Limitations & Risks
- Trade-offs and boundary conditions

### Recommended Next Action
- Concrete project steps to test
\`\`\`
`
  },
  {
    path: 'skills/code-architect.md',
    folder: 'skills',
    name: 'code-architect.md',
    content: `---
title: Code Architect & Refactorer Skill
category: skills
role: Principal Software Architect
model: gemini-2.5-pro
version: 2.0.0
trigger: pre-commit
inputs:
  - code_snippet
  - language
  - performance_requirements
tags:
  - agent-skill
  - engineering
  - code-quality
---

# 🤖 Agent Skill: Code Architect & Refactorer

## Identity
You are a Staff Software Architect who prioritizes maintainability, single-responsibility principles, zero memory leaks, and crystal-clear type safety.

## Evaluation Checklist
- [ ] Is state mutated unnecessarily?
- [ ] Are error boundaries and failure fallbacks resilient?
- [ ] Does the implementation avoid premature optimization while respecting O(n) algorithmic limits?
- [ ] Are variable names self-documenting and free of vague acronyms?

## System Instructions
\`\`\`markdown
Analyze the code provided in \`{{code_snippet}}\` for language \`{{language}}\`.

Respond strictly in four sections:
1. **Architecture Critique**: Identify subtle race conditions or boundary failure modes.
2. **Refactored Code**: Clean, production-ready rewrite with complete types.
3. **Complexity Delta**: Time and space complexity before vs after.
4. **Unit Test Blueprint**: 3 edge-case test specifications to add to test runner.
\`\`\`
`
  },
  {
    path: 'skills/deep-work-planner.md',
    folder: 'skills',
    name: 'deep-work-planner.md',
    content: `---
title: Deep Work & Energy Schedule Planner
category: skills
role: Executive Performance & Energy Coach
model: gemini-2.5-flash
version: 1.0.0
trigger: weekly-review
inputs:
  - active_projects
  - calendar_constraints
  - energy_levels
tags:
  - agent-skill
  - productivity
  - planning
---

# 🤖 Agent Skill: Deep Work & Energy Schedule Planner

## Mission
Transform open projects and ambitious goals into a realistic, low-friction weekly operating schedule aligned with circadian energy peaks.

## Heuristics
- Reserve morning blocks (8:30 AM - 11:30 AM) strictly for creative synthesis and core coding.
- Schedule meetings, administrative triage, and email batches after 2:00 PM.
- Buffer at least 25% slack time across each day for unexpected emergencies.

## Output Schema
\`\`\`markdown
### Weekly Focus Architecture
- **P0 Priority**: [Single must-complete milestone]
- **Supporting Work**: [Max 2 secondary project tasks]

### Daily Timeblock Schedule
- **Monday - Friday Flow**:
  - Morning Deep Block (90-120 min): [Target item]
  - Midday Recovery / Physical Training: [Routine]
  - Afternoon Secondary Block: [Target item]
\`\`\`
`
  },
  {
    path: 'skills/prompt-evaluator.md',
    folder: 'skills',
    name: 'prompt-evaluator.md',
    content: `---
title: Prompt Evaluator & Red Teamer
category: skills
role: AI Prompt Security & Reliability Auditor
model: gemini-2.5-pro
version: 1.1.0
trigger: on-demand
inputs:
  - candidate_prompt
  - target_schema
tags:
  - agent-skill
  - prompt-engineering
  - evaluation
---

# 🤖 Agent Skill: Prompt Evaluator & Red Teamer

## Purpose
Stress-test and audit system prompts for edge-case failures, ambiguity, jailbreak vulnerability, and output format consistency.

## Audit Matrix
1. **Format Enforcement**: Does the prompt include strict negative constraints?
2. **Token Economy**: Can redundant instructions be pruned by 30%+ without losing semantic intent?
3. **Ambiguity Test**: Can a user input intentionally mislead the agent into conflicting instructions?
`
  },

  // --- NOTES ---
  {
    path: 'notes/weekly-review-protocol.md',
    folder: 'notes',
    name: 'weekly-review-protocol.md',
    content: `---
title: Sunday Weekly Review & Calibration Protocol
category: notes
status: active
tags:
  - review
  - ritual
  - alignment
---

# 📓 Sunday Weekly Review & Calibration Protocol

> "Weeks turn into years. Guard your weekly trajectory."

## 1. Clear Inboxes & Capture
- [x] Process all browser tabs into bookmarks or project tasks
- [x] Review physical notebook scratchpad for open loops
- [ ] Export completed agent skills and update version tags

## 2. Review Goals & Projects
- Open [[ai-systems-mastery.md]] and confirm weekly sub-milestones
- Check progress on [[autonomous-research-agent.md]]
- Verify training log for [[half-marathon-sub-1h45.md]]

## 3. Run Agent Planner
- Trigger \`@deep-work-planner\` with upcoming week's calendar constraints.
`
  },

  // --- ARCHIVE ---
  {
    path: 'archive/2025/2025-annual-retrospective.md',
    folder: 'archive/2025',
    name: '2025-annual-retrospective.md',
    content: `---
title: 2025 Annual Retrospective & Legacy Archive
category: archive
status: archived
archived_at: 2025-12-31
tags:
  - retrospective
  - archive
  - legacy
---

# 📦 2025 Annual Retrospective & Legacy Archive

Archived on: 2025-12-31

## Final Status Summary
All 2025 annual targets completed and preserved into cold storage. Foundational architecture for the markdown knowledge vault established.

## Completed Milestones
- [x] Initialized personal markdown vault architecture and bi-directional Drive synchronization
- [x] Deployed first autonomous LLM research pipelines
- [x] Completed 1,200 km cumulative annual running volume

## Retrospective Lessons
- Prioritize deterministic frontmatter schemas over freeform tags.
- Keep weekly reviews sacred to prevent goal drift.
`
  }
];

export function getInitialVaultFiles(): VaultFile[] {
  const now = Date.now();
  return rawFiles.map((rf) => {
    const { frontmatter } = parseFrontmatter(rf.content);
    return {
      id: rf.path,
      name: rf.name,
      path: rf.path,
      folder: rf.folder,
      content: rf.content,
      frontmatter,
      createdAt: now,
      updatedAt: now,
    };
  });
}
