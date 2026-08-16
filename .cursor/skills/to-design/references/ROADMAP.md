# Roadmap areas

Condensed from the [AI-ready Design System Roadmap](https://designsystems.surf). Load this in **Ground**. Inline only the areas this run will touch.

**Lock** mode: Define + Create. Skip Adopt and Evolve.
**Gap** mode: pick 3–5 areas that block current work, create quality risk, or make AI guess.

For each area: expected outcome, ready-enough test, what the MD must contain, one readiness prompt. The human owns decisions. The agent applies them and **flags** missing context.

## Define

| Area | Outcome | Ready enough | MD must contain | Readiness prompt |
| --- | --- | --- | --- | --- |
| **Goals** | Shared direction tied to product and user outcomes | The team can make consistent scope and priority calls from the goals | Purpose, audience, outcomes, evidence, priorities, constraints, non-goals | Compare initiative A vs B against our goals. Recommend which comes first. Flag missing context. Do not invent priorities. |
| **Principles** | A small set that resolves real trade-offs | Common system trade-offs resolve the same way | Each principle: intent, decision guidance, trade-off when it collides, follow/violate example, related goal | Evaluate decision A vs B using our principles. Recommend the better option. Flag unclear principles. Do not invent new rules. |
| **Scope** | Current support vs deferred vs out of scope | A request can be include / defer / exclude without debate | Covered surfaces and depth, exclusions, deferred work with reasons | Assess whether [request] fits current scope. Choose include, defer, or exclude. Flag missing boundaries. Do not expand scope. |
| **Architecture** | Layers, dependencies, sources of truth | A new decision can be placed, named, and traced | Layers, naming, dependencies, source of truth per decision type, placement rules | Place [new decision] in our architecture. Name its layer, dependencies, source, and name. Flag missing structure. Do not invent layers. |
| **Ownership** | Who decides, reviews, escalates | Each decision type has a named owner and a path | Accountable owner per area, decision rights, reviewers, escalation. Route; do not assign authority | Route [request] to the right owner. Who decides, who reviews, where unresolved issues go. Flag missing ownership. Do not assign authority. |

## Create

| Area | Outcome | Ready enough | MD must contain | Readiness prompt |
| --- | --- | --- | --- | --- |
| **Foundations** | Shared visual and behavioral decisions | Common interface choices do not spawn local rules | Per foundation: meaning, usage, relationships, constraints, examples | Apply our foundations to [scenario]. Identify the relevant decisions, rules, and constraints. Flag missing guidance. Do not invent values or rules. |
| **Tokens** | Machine-readable meaning across design, code, AI | Tokens reuse without losing role or references | Layers, naming, semantic roles, references, modes, usage boundaries | Map [decision] to our tokens. Select the semantic token and explain its reference path. Flag missing coverage. Do not invent tokens or values. |
| **Components** | Reusable UI with purpose, API, states, composition | Teams combine components without local variants | Per component: purpose, anatomy, properties, variants, states, accessibility, composition, unsupported uses | Build [interface] with our components. Use valid properties, states, and composition. Flag missing coverage. Do not invent components or variants. |
| **Design–code alignment** | Design and code represent the same decisions | Moving between design and code does not reinterpret the system | Mappings, aligned APIs/states, behavior parity, supported exceptions | Translate [component] using the mapped implementation. Preserve properties, states, behavior, constraints. Flag missing mappings. Do not invent APIs or behavior. |
| **Documentation** | Trusted, findable, current guidance | Teams apply current guidance without asking a person | Purpose, usage, constraints, examples (labeled), exceptions, status | Explain [scenario] using our system. Cite guidance, constraints, exceptions. Flag missing guidance. Do not invent system rules. |

## Adopt (Gap mode only)

Skip on a first lock. Include only when the gap is adoption, not missing foundations.

| Area | MD must contain | Readiness prompt |
| --- | --- | --- |
| **Release** | Current version, included assets, compatibility, breaking changes, status | Can [product] adopt [release]? Identify compatible versions and risks. Flag missing release data. Do not assume compatibility. |
| **Communication** | Approved facts, audience, impact, required action, voice | Draft an update for [audience] about [change]. Flag missing facts. Do not invent benefits or actions. |
| **Enablement** | Role, task, approved guidance, limits, support path | Guide [role] through [task] using approved guidance. Flag missing guidance. Direct unsupported cases to support. |
| **Contribution** | Criteria, proposal format, evidence bar | Turn [request] into a proposal. Identify missing evidence. Do not approve changes or assign ownership. |
| **Governance** | Decision type, rights, review criteria, exceptions, escalation | Evaluate [request] against our criteria. Identify reviewers and path. Flag missing authority. Do not approve the decision. |

## Evolve (Gap mode only)

Skip on a first lock. Include only when the system is in use and needs evidence.

| Area | MD must contain | Readiness prompt |
| --- | --- | --- |
| **Metrics** | Definitions, sources, baselines, segments, limits | Explain the change in [metric] for [period]. Flag missing data. Do not infer unsupported causes. |
| **Feedback** | Records, source, area, evidence, status | Group [feedback] into themes. Preserve disagreement. Flag weak patterns. Do not assign priority. |
| **Maintenance** | Current sources, expected behavior, dependencies | Diagnose [issue]. Smallest valid fix. Flag missing context. Do not redesign or remove assets. |
| **Deprecation** | Asset, usage map, replacement, timeline | Plan migration from [deprecated] to [replacement]. Flag missing coverage. Do not remove support early. |
| **Prioritization** | Goals, criteria, evidence, dependencies, capacity | Compare item A vs B. Explain trade-offs. Flag missing inputs. Do not set final priority. |
