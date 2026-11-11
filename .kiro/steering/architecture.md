# LINE 13 Architecture Steering

## Ownership boundaries

- Web UI owns rendering and input, not puzzle truth.
- Graph engine owns puzzle truth and replay, not presentation.
- Haunting engine maps events to declarative cues, not graph decisions.
- Episode schema is the contract shared by every component.
- Backend extends content and sharing, never core playability.
- Night Operator produces reviewed content packs, never live gameplay decisions.

## Engineering rules

- Use TypeScript strict mode.
- Represent domain variants with discriminated unions.
- Keep graph functions pure and deterministic.
- Make random behavior consume an explicit seed.
- Validate all remote and generated content at the boundary.
- Render episode content as text, never injected HTML.
- Keep AWS credentials outside source, logs, browser bundles, test fixtures, and recordings.
- Grant every AWS function the smallest resource and action set it needs.
- Make failures explicit and recoverable; never silently substitute a different puzzle state.
- Keep the bundled episode as a first-class production path, not a test fixture.

## Dependency rule

Add a package only when it removes more risk than it adds. Prefer browser APIs, React, and pure TypeScript for the core. Avoid a 3D engine, runtime LLM SDK in the browser, authentication framework, analytics suite, or state library unless a measured requirement cannot be met otherwise.

## Agent integration rule

Parallel agents may work only after EpisodeManifest, GameEvent, and HauntCue contracts are versioned. Each agent owns disjoint directories and an independent branch from main. No stacked branches. The integration owner alone resolves contract changes.
