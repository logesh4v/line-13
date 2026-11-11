/**
 * Single seam to the versioned shared episode contracts.
 *
 * The contract package is owned elsewhere (`packages/contracts`) and is the only
 * shared truth between generator, validator, backend and client. This module is
 * the one place in `apps/api` that spells the path to it, so the integration
 * owner can swap the relative specifier for the workspace specifier
 * (`@line-13/contracts`) once `node_modules` exists, by editing one line.
 *
 * The relative form is used today because this package installs nothing: the
 * tests must run on a bare checkout with Node 22 type stripping alone.
 */
export * from '../../../packages/contracts/src/index.ts';
