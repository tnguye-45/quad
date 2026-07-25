# Reusable template — deep analysis / audit prompt

How to use: fill every {{PLACEHOLDER}}, delete sections that don't apply, delete these
usage notes. The four principles that make it work:

1. **Give context as facts to trust, not homework.** 5–8 bullets the model doesn't
   have to rediscover — product, stack, current state, recent changes.
2. **State constraints that should shape recommendations.** Team size, hours, budget,
   what actually kills the project. This kills generic enterprise advice.
3. **Name a source-of-truth artifact for each analysis area.** The specificity of the
   output comes from ordering "audit X against doc Y line by line" — a contract doc,
   a spec, a checklist, a migration set. If no doc exists, that IS a finding.
4. **Force an evidence format.** Severity + file:line + quoted code + why it matters
   for YOUR failure modes + fix with effort in hours. Plus a single ranked list and
   explicit non-findings.

---

# Task: {{ANALYSIS_TYPE — e.g. "Overall development analysis"}} of {{TARGET — repo/system name}}

You are analyzing {{ONE-SENTENCE DESCRIPTION: what it is, who builds it, who it's for}}.
Your job is a comprehensive, engineering-focused analysis producing a prioritized report
the developer can act on. You are analyzing, not implementing — do not modify files.

## Context you should trust

- **Product:** {{surfaces / features / core user flows, 1–3 bullets}}
- **Stack:** {{frameworks, versions, backend, hosting, what does NOT exist yet}}
- **State:** {{maturity — prototype / MVP / production; what's wired vs mocked}}
- **Recent changes:** {{the last big refactor/security pass/migration — and which doc describes it}}
- **Constraints that shape every recommendation:** {{team size, hours/week, budget,
  real failure modes}}. Do not recommend work that ignores this.

## Read these first, in order

1. {{intent docs — README, roadmap}}
2. {{ground-truth doc — constraints, known blockers}}
3. {{contracts/specs/migrations — the things code must conform to}}
4. {{core modules — the 5–8 files where the real logic lives}}
5. {{everything else — screens, functions, scripts}}

## What to analyze

For each area: name the area, name the artifact it's audited against, and one sentence
of what "specific" means there. Keep 4–7 areas.

**1. {{AREA — e.g. Architecture & code health}}.** {{what to look at; call out known
suspects by filename}}. {{a pointed question, e.g. "Where would the next feature be
painful to add, and why?"}}

**2. {{AREA — e.g. Contract adherence}}.** Audit {{CODE SURFACE}} against
{{SOURCE-OF-TRUTH DOC}} line by line: {{3–5 concrete rules from that doc, restated}}.
Flag every violation with file and line.

**3. {{AREA — e.g. Security & privacy}}.** {{fresh-eyes instruction: "assume the
previous audit missed things"}}. {{enumerate the specific leak/bypass classes that
matter for THIS app}}.

**4. {{AREA — e.g. Correctness & reliability}}.** {{race conditions, edge cases,
error handling — name the specific mechanisms in this codebase}}.

**5. {{AREA — e.g. Performance}}.** {{query patterns, re-renders, and the LIMITS OF
YOUR ACTUAL TIER/PLAN, not hypothetical scale}}.

**6. {{AREA — e.g. Launch/production readiness}}.** Verify or update the known blocker
list: {{paste the current known blockers}}. Distinguish code blockers from operational ones.

**7. {{AREA — e.g. Test & tooling gaps}}.** Given {{THE CONSTRAINT}}, identify the
*minimal* set with the highest payoff — not an ideal suite.

## Output format

A single markdown report:

1. **Executive summary** — ≤ 300 words, overall health grade, the three most important findings.
2. **Findings** — grouped by the areas above. Each finding: severity
   (Critical / High / Medium / Low), file:line references, evidence (quote the code),
   why it matters *for this project's actual failure modes*, and a concrete fix with
   rough effort (hours, not story points).
3. **Prioritized action list** — a single ranked list, top 10 max, ordered by
   ({{IMPACT METRIC}}) ÷ ({{COST METRIC — e.g. founder hours}}). One next action at
   the top, not a menu.
4. **Explicit non-findings** — things you checked that are fine, so effort isn't
   wasted re-auditing them.

Ground every claim in a file path. If you estimate, label it an estimate. If a doc
contradicts the code, the code wins — but flag the stale doc. Do not propose
{{SCOPE CREEP TO BAN — new features, monetization, rewrites}}; this is an analysis
of what exists.
