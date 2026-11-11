import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * Guards for the rules that a transpile cannot check and that nobody notices
 * until the page is on a projector: a class name that never reached the
 * stylesheet, a remote font sneaking in, an emoji standing in for an icon, or
 * dashboard furniture appearing in a diegetic interface.
 */

const SRC = fileURLToPath(new URL('.', import.meta.url));
const APP = fileURLToPath(new URL('..', import.meta.url));

function walk(directory: string, extension: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path, extension, found);
      continue;
    }
    // Shipped source only. The tests themselves quote the very strings these
    // rules forbid, so scanning them would make every rule fail on itself.
    if (path.endsWith(extension) && !path.includes('.test.')) {
      found.push(path);
    }
  }
  return found;
}

function read(paths: readonly string[]): string {
  return paths.map((path) => readFileSync(path, 'utf8')).join('\n');
}

const componentSource = read([...walk(SRC, '.tsx')]);
const logicSource = read([...walk(SRC, '.ts')]);
const styleSource = read([...walk(join(SRC, 'styles'), '.css')]);
const markup = readFileSync(join(APP, 'index.html'), 'utf8');

describe('class names', () => {
  it('only uses classes the stylesheets actually define', () => {
    const defined = new Set<string>();
    for (const match of styleSource.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      const name = match[1];
      if (name !== undefined) {
        defined.add(name);
      }
    }

    const used = new Set<string>();
    for (const match of componentSource.matchAll(/className="([^"]+)"/g)) {
      for (const name of (match[1] ?? '').split(/\s+/)) {
        if (name.length > 0) {
          used.add(name);
        }
      }
    }

    assert.ok(used.size > 0, 'found no class names to check');
    const missing = [...used].filter((name) => !defined.has(name)).sort();
    assert.deepEqual(missing, [], `classes used but never styled: ${missing.join(', ')}`);
  });
});

describe('nothing is fetched from anywhere', () => {
  it('loads no remote font, stylesheet or script', () => {
    assert.equal(/https?:\/\//.test(markup), false, 'index.html reaches off-origin');
    assert.equal(/@import/.test(styleSource), false, 'a stylesheet imports something');
    assert.equal(
      /url\(\s*['"]?https?:/.test(styleSource),
      false,
      'a stylesheet fetches a remote asset',
    );
    assert.equal(/@font-face/.test(styleSource), false, 'a web font is being loaded');
  });

  it('calls no network API from the client at all', () => {
    const everySource = `${componentSource}\n${logicSource}`;
    for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon']) {
      assert.equal(
        everySource.includes(forbidden),
        false,
        `the client uses ${forbidden}; the bundled episode must need no network`,
      );
    }
  });

  it('invokes no model at runtime', () => {
    const everySource = `${componentSource}\n${logicSource}\n${markup}`;
    for (const forbidden of ['bedrock', 'openai', 'anthropic', 'InvokeModel', 'polly.']) {
      assert.equal(
        everySource.toLowerCase().includes(forbidden.toLowerCase()),
        false,
        `found ${forbidden} in the client bundle`,
      );
    }
  });
});

describe('the interface stays diegetic', () => {
  it('uses no emoji as an icon', () => {
    const emoji =
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u;
    assert.equal(emoji.test(componentSource), false, 'an emoji reached a component');
    assert.equal(emoji.test(styleSource), false, 'an emoji reached a stylesheet');
  });

  it('carries no dashboard furniture in its class vocabulary', () => {
    const banned = [
      'hero',
      'card',
      'sidebar',
      'navbar',
      'stat-',
      'dashboard',
      'kpi',
      'tile',
      'breadcrumb',
    ];
    for (const name of banned) {
      assert.equal(
        styleSource.includes(`.${name}`),
        false,
        `the stylesheet defines .${name}, which is application chrome`,
      );
    }
  });

  it('renders episode text as text and never as markup', () => {
    const everySource = `${componentSource}\n${logicSource}`;
    for (const forbidden of ['dangerouslySetInnerHTML', 'innerHTML', 'document.write']) {
      assert.equal(everySource.includes(forbidden), false, `found ${forbidden}`);
    }
  });
});

describe('accessibility affordances are present in the source', () => {
  it('ships a no-script explanation', () => {
    assert.ok(markup.includes('<noscript>'));
  });

  it('honours the operating system motion preference in CSS, not only in state', () => {
    assert.ok(styleSource.includes('prefers-reduced-motion'));
  });

  it('declares a high-contrast token set rather than a colour filter', () => {
    assert.ok(styleSource.includes('[data-contrast="high"]'));
    assert.equal(
      /filter:\s*contrast/.test(styleSource),
      false,
      'high contrast must be real tokens, not a filter over the same panel',
    );
  });

  it('keeps every interactive target at or above the 44px touch floor', () => {
    const jackMin = /--jack-min:\s*(\d+)px/.exec(styleSource);
    assert.ok(jackMin !== null, 'the jack size token is missing');
    assert.ok(Number(jackMin[1]) >= 44, `jack socket is ${jackMin[1]}px`);
  });
});
