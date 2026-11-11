/**
 * The single seam onto the shared episode contract.
 *
 * Every module in this app imports episode, event and cue types from here and
 * never from a deeper path, so when the integration owner links the workspace
 * package the swap is this one line:
 *
 *   export * from '@line-13/contracts';
 *
 * The relative source import is deliberate for the vertical slice: it resolves
 * under Vite, under `tsc --noEmit` and under `node --test` with no installed
 * dependencies, which is what lets the slice be validated before anyone runs
 * `npm install`.
 */
export * from '@line-13/contracts';
