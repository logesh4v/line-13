import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A lint over the CloudFormation templates, not a policy evaluator.
 *
 * "Grant every AWS function the smallest resource and action set it needs" is
 * an engineering rule in the architecture steering, and a rule nobody checks is
 * a rule that drifts. These assertions read the template text and pin the
 * properties that make the least-privilege and no-PII claims true. They prove
 * what the templates SAY; they never prove a stack exists, and they are not a
 * substitute for `aws cloudformation validate-template`, which is a deployment
 * gap recorded in the infra README.
 *
 * The statement reader below is a deliberately small YAML subset reader -- this
 * package installs nothing, so there is no YAML parser available. It is kept
 * honest by `the statement reader sees every policy statement`: if a template's
 * shape changes so that statements stop being recognised, that test fails
 * loudly rather than letting the rest pass over an empty list.
 */

const TEMPLATE_DIR = fileURLToPath(new URL('../../../infra/cloudformation', import.meta.url));

/** Statement counts per template, so an under-reading parser cannot pass. */
const EXPECTED_STATEMENTS: Readonly<Record<string, number>> = {
  'api.yaml': 10,
  'content-storage.yaml': 3,
  'publication-role.yaml': 9,
};

/**
 * The one documented wildcard resource. Amazon Polly's synthesis actions take
 * no resource ARN, so the grant cannot be narrowed by resource; it is narrowed
 * instead by action list, by region condition, and by living on a role that no
 * request handler can assume.
 */
const ALLOWED_WILDCARD_RESOURCE_SIDS: ReadonlySet<string> = new Set(['SynthesizeCallerSpeech']);

interface Statement {
  readonly template: string;
  readonly sid: string;
  readonly effect: string;
  readonly actions: readonly string[];
  readonly resources: readonly string[];
  readonly notResources: readonly string[];
  readonly text: string;
}

function templateFiles(): readonly string[] {
  return readdirSync(TEMPLATE_DIR)
    .filter((entry) => entry.endsWith('.yaml') || entry.endsWith('.yml'))
    .sort();
}

function read(name: string): string {
  return readFileSync(join(TEMPLATE_DIR, name), 'utf8');
}

/** True for a YAML sequence entry that is a value rather than a mapping key. */
function isValueListItem(trimmed: string): boolean {
  return /^- ['"!*]/.test(trimmed) || trimmed === '- *';
}

function parseStatements(template: string, text: string): readonly Statement[] {
  const lines = text.split('\n');
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*-\s+(Sid|Effect):/.test(lines[index]!)) {
      starts.push(index);
    }
  }

  const statements: Statement[] = [];
  for (let position = 0; position < starts.length; position += 1) {
    const from = starts[position]!;
    const indent = lines[from]!.length - lines[from]!.trimStart().length;

    // A statement ends at the next statement, or as soon as the document
    // dedents past the statement's own list marker -- otherwise the last
    // statement in a file swallows every resource that follows it.
    let to = position + 1 < starts.length ? starts[position + 1]! : lines.length;
    for (let cursor = from + 1; cursor < to; cursor += 1) {
      const line = lines[cursor]!;
      if (line.trim().length === 0) {
        continue;
      }
      if (line.length - line.trimStart().length < indent) {
        to = cursor;
        break;
      }
    }
    const chunk = lines.slice(from, to);

    let sid = '';
    let effect = '';
    const collected: Record<string, string[]> = { Action: [], Resource: [], NotResource: [] };
    let currentKey = '';

    for (const raw of chunk) {
      const trimmed = raw.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) {
        continue;
      }

      if (isValueListItem(trimmed)) {
        const value = trimmed.slice(2).trim();
        collected[currentKey]?.push(value);
        continue;
      }

      const body = trimmed.startsWith('- ') ? trimmed.slice(2).trim() : trimmed;
      const keyed = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(body);
      if (keyed === null) {
        continue;
      }
      const [, key, inline] = keyed as unknown as [string, string, string];
      currentKey = key;
      if (inline.length === 0) {
        continue;
      }
      if (key === 'Sid') {
        sid = inline;
      } else if (key === 'Effect') {
        effect = inline;
      } else if (collected[key] !== undefined) {
        collected[key]!.push(inline);
      }
    }

    statements.push({
      template,
      sid,
      effect,
      actions: collected['Action']!.map(unquote),
      resources: collected['Resource']!.map(unquote),
      notResources: collected['NotResource']!.map(unquote),
      text: chunk.join('\n'),
    });
  }

  return statements;
}

function unquote(value: string): string {
  const match = /^'(.*)'$|^"(.*)"$/.exec(value);
  if (match === null) {
    return value;
  }
  return match[1] ?? match[2] ?? value;
}

function allStatements(): readonly Statement[] {
  return templateFiles().flatMap((name) => parseStatements(name, read(name)));
}

/** Service actions only: skips `!Sub`-wrapped ARNs and other non-action values. */
function serviceActions(statement: Statement): readonly string[] {
  return statement.actions.filter((action) => action === '*' || /^[a-z0-9]+:[A-Za-z*]/.test(action));
}

test('the templates are the four the deployment expects', () => {
  assert.deepEqual(templateFiles(), ['api.yaml', 'content-storage.yaml', 'publication-role.yaml', 'web-hosting.yaml']);

  for (const name of templateFiles()) {
    const text = read(name);
    assert.match(text, /^AWSTemplateFormatVersion: '2010-09-09'/m, name);
    assert.match(text, /^Description: >-/m, name);
    assert.match(text, /^Resources:/m, name);
  }
});

test('the statement reader sees every policy statement', () => {
  for (const [name, expected] of Object.entries(EXPECTED_STATEMENTS)) {
    const statements = parseStatements(name, read(name));
    assert.equal(statements.length, expected, `${name}: statement count moved`);
    for (const statement of statements) {
      assert.ok(
        statement.effect === 'Allow' || statement.effect === 'Deny',
        `${name}: ${statement.sid || '(no sid)'} has no readable Effect`,
      );
      assert.ok(
        serviceActions(statement).length > 0,
        `${name}: ${statement.sid || '(no sid)'} has no readable Action`,
      );
    }
  }
});

test('no Allow statement grants a wildcard action', () => {
  const offenders: string[] = [];

  for (const statement of allStatements()) {
    if (statement.effect !== 'Allow') {
      continue;
    }
    for (const action of serviceActions(statement)) {
      if (action === '*' || action.endsWith(':*')) {
        offenders.push(`${statement.template}: ${statement.sid || '(no sid)'} -> ${action}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test('no Allow statement grants a wildcard resource, bar the documented Polly exception', () => {
  const offenders: string[] = [];

  for (const statement of allStatements()) {
    if (statement.effect !== 'Allow' || !statement.resources.includes('*')) {
      continue;
    }
    if (!ALLOWED_WILDCARD_RESOURCE_SIDS.has(statement.sid)) {
      offenders.push(`${statement.template}: ${statement.sid || '(no sid)'}`);
    }
  }

  assert.deepEqual(offenders, []);
});

test('the one permitted wildcard grant is bounded by action list and region', () => {
  const wildcardAllows = allStatements().filter(
    (statement) => statement.effect === 'Allow' && statement.resources.includes('*'),
  );

  assert.equal(wildcardAllows.length, 1);
  const polly = wildcardAllows[0]!;
  assert.equal(polly.template, 'publication-role.yaml');
  for (const action of serviceActions(polly)) {
    assert.ok(action.startsWith('polly:'), action);
  }
  assert.match(polly.text, /aws:RequestedRegion/);
  // A lexicon write would let the pipeline change how any future text is
  // pronounced, so it is not granted.
  assert.equal(serviceActions(polly).includes('polly:PutLexicon'), false);
});

test('no role leans on an AWS managed policy', () => {
  for (const name of templateFiles()) {
    const text = read(name);
    assert.equal(text.includes('ManagedPolicyArns'), false, name);
    assert.equal(text.includes('AWSLambdaBasicExecutionRole'), false, name);
    assert.equal(text.includes('arn:aws:iam::aws:policy'), false, name);
  }
});

test('every role is assumable by exactly one named principal', () => {
  const assumeStatements = allStatements().filter((statement) =>
    serviceActions(statement).includes('sts:AssumeRole'),
  );

  // Three request roles plus the publication role.
  assert.equal(assumeStatements.length, 4);
  for (const statement of assumeStatements) {
    assert.equal(statement.effect, 'Allow');
    assert.match(statement.text, /Principal:/);
    assert.equal(/Principal:\s*'\*'/.test(statement.text), false, statement.template);
    assert.equal(/AWS:\s*'\*'/.test(statement.text), false, statement.template);
  }
});

test('the request roles hold exactly the data actions the three handlers need', () => {
  const api = parseStatements('api.yaml', read('api.yaml'));

  const granted = api
    .filter((statement) => statement.effect === 'Allow')
    .flatMap(serviceActions)
    .filter((action) => !action.startsWith('logs:') && action !== 'sts:AssumeRole')
    .sort();

  assert.deepEqual(granted, [
    'dynamodb:GetItem',
    'dynamodb:Query',
    'dynamodb:UpdateItem',
    's3:GetObject',
  ]);
});

test('no request role can enumerate a table or mutate content', () => {
  const api = parseStatements('api.yaml', read('api.yaml'));

  for (const statement of api) {
    if (statement.effect !== 'Allow') {
      continue;
    }
    for (const action of serviceActions(statement)) {
      for (const forbidden of [
        'dynamodb:Scan',
        'dynamodb:BatchWriteItem',
        'dynamodb:DeleteItem',
        'dynamodb:PutItem',
        's3:ListBucket',
        's3:PutObject',
        's3:DeleteObject',
      ]) {
        assert.notEqual(action, forbidden, `${statement.sid}: ${action}`);
      }
    }
  }
});

test('no request role can reach a model or speech service', () => {
  const api = parseStatements('api.yaml', read('api.yaml'));

  for (const statement of api) {
    for (const action of serviceActions(statement)) {
      for (const prefix of ['bedrock:', 'polly:', 'sagemaker:', 'comprehend:']) {
        assert.equal(action.startsWith(prefix), false, `${statement.sid}: ${action}`);
      }
    }
  }
});

test('the daily episode read is a one-item index query, not a table scan', () => {
  const api = parseStatements('api.yaml', read('api.yaml'));
  const query = api.find((statement) => statement.sid === 'QueryPublishedDay');

  assert.ok(query);
  assert.deepEqual(serviceActions(query), ['dynamodb:Query']);
  // Scoped to the index ARN, so the same grant cannot query the base table.
  assert.match(query.resources.join(' '), /index\/published-day-index/);
});

test('the manifest read is scoped to the manifest prefix, not the bucket', () => {
  const api = parseStatements('api.yaml', read('api.yaml'));
  const manifests = api.find((statement) => statement.sid === 'ReadManifestObjects');

  assert.ok(manifests);
  assert.deepEqual(serviceActions(manifests), ['s3:GetObject']);
  assert.match(manifests.resources.join(' '), /episodes\/\*/);
  assert.equal(manifests.resources.join(' ').includes('audio/'), false);
});

test('each log grant is scoped to that function own group, and creates no group', () => {
  const api = parseStatements('api.yaml', read('api.yaml'));
  const logStatements = api.filter((statement) =>
    serviceActions(statement).some((action) => action.startsWith('logs:')),
  );

  assert.equal(logStatements.length, 3);
  for (const statement of logStatements) {
    assert.deepEqual([...serviceActions(statement)].sort(), [
      'logs:CreateLogStream',
      'logs:PutLogEvents',
    ]);
    assert.match(statement.resources.join(' '), /LogGroup\.Arn/);
  }

  // Checked against parsed actions rather than the raw text: the template
  // mentions this action in a comment explaining why nothing is granted it.
  for (const statement of allStatements()) {
    assert.equal(
      serviceActions(statement).includes('logs:CreateLogGroup'),
      false,
      `${statement.template}: ${statement.sid}`,
    );
  }
});

test('the publication role may draft only with Amazon Nova', () => {
  const statements = parseStatements('publication-role.yaml', read('publication-role.yaml'));

  const allow = statements.find(
    (statement) =>
      statement.effect === 'Allow' && serviceActions(statement).includes('bedrock:InvokeModel'),
  );
  assert.ok(allow, 'no Bedrock invoke grant found');
  for (const resource of allow.resources) {
    assert.match(resource, /amazon\.nova-/);
  }

  const deny = statements.find(
    (statement) => statement.effect === 'Deny' && statement.notResources.length > 0,
  );
  assert.ok(deny, 'no explicit deny for non-Amazon models');
  assert.ok(serviceActions(deny).includes('bedrock:InvokeModel'));
  for (const resource of deny.notResources) {
    assert.match(resource, /amazon\./);
  }
  // The deny is wider than the allow on purpose: streaming and Converse are
  // denied too, so reaching another provider needs a policy change, not a code
  // change (R6.6).
  assert.ok(serviceActions(deny).includes('bedrock:Converse'));
  assert.ok(serviceActions(deny).includes('bedrock:InvokeModelWithResponseStream'));
});

test('the publication role cannot delete published content', () => {
  const statements = parseStatements('publication-role.yaml', read('publication-role.yaml'));

  for (const statement of statements) {
    if (statement.effect !== 'Allow') {
      continue;
    }
    for (const action of serviceActions(statement)) {
      assert.equal(action.toLowerCase().includes('delete'), false, action);
    }
  }

  const denied = statements
    .filter((statement) => statement.effect === 'Deny')
    .flatMap(serviceActions);

  for (const required of ['s3:DeleteObject', 's3:DeleteObjectVersion', 's3:PutBucketPolicy']) {
    assert.ok(denied.includes(required), `missing explicit deny: ${required}`);
  }
});

test('published objects must be written encrypted', () => {
  const statements = parseStatements('publication-role.yaml', read('publication-role.yaml'));
  const write = statements.find((statement) => statement.sid === 'WriteContentObjects');

  assert.ok(write);
  assert.deepEqual(serviceActions(write), ['s3:PutObject']);
  assert.match(write.text, /x-amz-server-side-encryption/);
});

test('every function is a bounded Node 22 Lambda outside a VPC', () => {
  const text = read('api.yaml');

  assert.equal((text.match(/Type: AWS::Lambda::Function/g) ?? []).length, 3);
  assert.equal((text.match(/Runtime: nodejs22\.x/g) ?? []).length, 3);
  assert.equal((text.match(/Architectures: \[arm64\]/g) ?? []).length, 3);
  assert.equal((text.match(/ReservedConcurrentExecutions:/g) ?? []).length, 3);
  assert.equal(text.includes('VpcConfig'), false);

  for (const timeout of text.match(/^\s+Timeout: (\d+)$/gm) ?? []) {
    assert.ok(Number(timeout.split(':')[1]!.trim()) <= 10, timeout);
  }
});

test('no environment variable is credential-shaped', () => {
  const text = read('api.yaml');

  for (const line of text.match(/^\s+[A-Z][A-Z0-9_]*:/gm) ?? []) {
    const name = line.trim().replace(':', '');
    assert.equal(/SECRET|PASSWORD|CREDENTIAL|_TOKEN$/.test(name), false, name);
  }
});

test('every log group has a finite retention', () => {
  const text = read('api.yaml');
  const groups = (text.match(/Type: AWS::Logs::LogGroup/g) ?? []).length;
  const retentions = (text.match(/RetentionInDays:/g) ?? []).length;

  assert.equal(groups, 4);
  assert.equal(retentions, groups);
});

test('the access log format records nothing that identifies a player', () => {
  const text = read('api.yaml');
  const format = /Format: >-\s*\n\s*(\{.*)/.exec(text);
  assert.ok(format, 'no access log format found');

  const lowered = format[1]!.toLowerCase();
  for (const forbidden of [
    'identity',
    'sourceip',
    'useragent',
    'user-agent',
    'authorizer',
    'cookie',
    'header',
    'body',
    'integrationerrormessage',
  ]) {
    assert.equal(lowered.includes(forbidden), false, forbidden);
  }
  assert.ok(lowered.includes('$context.requestid'));
  assert.ok(lowered.includes('$context.status'));
});

test('the API exposes exactly the three documented routes and no authorizer', () => {
  const text = read('api.yaml');
  const routeKeys = (text.match(/RouteKey: '([^']+)'/g) ?? [])
    .map((line) => unquote(line.replace('RouteKey: ', '')))
    .sort();

  assert.deepEqual(routeKeys, [
    'GET /v1/episodes/daily',
    'GET /v1/replays/{replayCode}',
    'POST /v1/endings',
  ]);
  // No account and no login (R8.4): with no authorizer there is no identity to
  // collect in the first place.
  assert.equal((text.match(/AuthorizationType: NONE/g) ?? []).length, 3);
  assert.equal(text.includes('AWS::ApiGatewayV2::Authorizer'), false);
  assert.equal(text.includes('AuthorizationType: JWT'), false);
});

test('each route invocation permission names one path', () => {
  const text = read('api.yaml');
  const permissions = text.match(/SourceArn: !Sub '[^']+'/g) ?? [];

  assert.equal(permissions.length, 3);
  for (const permission of permissions) {
    assert.match(permission, /execute-api/);
    assert.match(permission, /\/v1\//);
    assert.equal(permission.includes('/*/*/*'), false);
  }
});

test('cross-origin access names one origin and carries no credentials', () => {
  const text = read('api.yaml');

  assert.match(text, /AllowCredentials: false/);
  assert.match(text, /AllowMethods: \[GET, POST\]/);
  assert.equal(/AllowOrigins:\s*\n\s*-\s*'\*'/.test(text), false);
  assert.match(text, /AllowedPattern: '\^https:\/\//);
});

test('every table is pay-per-request and encrypted, and replays expire', () => {
  const text = read('api.yaml');

  assert.equal((text.match(/Type: AWS::DynamoDB::Table/g) ?? []).length, 3);
  assert.equal((text.match(/BillingMode: PAY_PER_REQUEST/g) ?? []).length, 3);
  assert.equal((text.match(/SSEEnabled: true/g) ?? []).length, 3);
  assert.match(text, /TimeToLiveSpecification:\s*\n\s*AttributeName: expiresAt\s*\n\s*Enabled: true/);
});

test('the content bucket is private, owner-enforced and encrypted', () => {
  const text = read('content-storage.yaml');

  for (const flag of [
    'BlockPublicAcls: true',
    'BlockPublicPolicy: true',
    'IgnorePublicAcls: true',
    'RestrictPublicBuckets: true',
    'ObjectOwnership: BucketOwnerEnforced',
    'SSEAlgorithm: AES256',
  ]) {
    assert.ok(text.includes(flag), flag);
  }
  assert.match(text, /VersioningConfiguration:\s*\n\s*Status: Enabled/);
});

test('the bucket grants nothing to the public and refuses plain HTTP', () => {
  const statements = parseStatements('content-storage.yaml', read('content-storage.yaml'));

  for (const statement of statements) {
    if (statement.effect !== 'Allow') {
      continue;
    }
    assert.equal(/Principal:\s*'\*'/.test(statement.text), false, statement.sid);
    assert.match(statement.text, /AWS:SourceArn/, statement.sid);
  }

  const tlsDeny = statements.find((statement) => statement.sid === 'DenyPlaintextTransport');
  assert.ok(tlsDeny);
  assert.equal(tlsDeny.effect, 'Deny');
  assert.match(tlsDeny.text, /aws:SecureTransport/);
});

test('the only bucket reader is a CloudFront distribution over origin access control', () => {
  const statements = parseStatements('content-storage.yaml', read('content-storage.yaml'));
  const read_ = statements.find((statement) => statement.sid === 'AllowDistributionToReadAudio');

  assert.ok(read_);
  assert.deepEqual(serviceActions(read_), ['s3:GetObject']);
  assert.match(read_.text, /Service: cloudfront\.amazonaws\.com/);
  assert.equal(read('content-storage.yaml').includes('CloudFrontOriginAccessIdentity'), false);
});

test('nothing in the templates hard-codes an account, region or credential', () => {
  for (const name of templateFiles()) {
    const text = read(name);
    assert.equal(/\b\d{12}\b/.test(text), false, `${name} contains a literal account id`);
    assert.equal(
      /'[a-z]{2}-[a-z]+-\d'/.test(text),
      false,
      `${name} contains a literal region`,
    );
    assert.match(text, /\$\{AWS::(Partition|Region|AccountId)\}|!Ref 'AWS::Region'/);
  }
});
