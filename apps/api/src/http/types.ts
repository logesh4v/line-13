/**
 * Transport types for the LINE 13 read-mostly API.
 *
 * `HttpRequest` is deliberately narrower than an API Gateway event: it carries
 * no headers, no cookies, no source IP and no user agent. Handlers therefore
 * cannot read, log or store a player identifier even by mistake, which is how
 * requirement R8.4 (no account, no personal data) is enforced by construction
 * rather than by review. `requestId` is the gateway's own correlation id, not a
 * client-supplied or client-stable value.
 */

export type HttpMethod = 'GET' | 'POST';

export interface HttpRequest {
  readonly method: HttpMethod;
  readonly routeKey: string;
  readonly pathParameters: Readonly<Record<string, string | undefined>>;
  readonly queryParameters: Readonly<Record<string, string | undefined>>;
  readonly body: string | undefined;
  readonly requestId: string;
}

export interface HttpResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export type HttpHandler = (request: HttpRequest) => Promise<HttpResponse>;

/**
 * Minimal structural view of an API Gateway HTTP API payload v2.0 event.
 *
 * Declared locally instead of depending on `@types/aws-lambda`: the dependency
 * rule in the architecture steering prefers no package where a few lines of
 * types will do, and this keeps the handler core installable-free.
 */
export interface ApiGatewayProxyEventV2 {
  readonly version: string;
  readonly routeKey: string;
  readonly rawPath: string;
  readonly pathParameters?: Readonly<Record<string, string | undefined>> | null;
  readonly queryStringParameters?: Readonly<Record<string, string | undefined>> | null;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly requestContext: {
    readonly requestId: string;
    readonly http: {
      readonly method: string;
      readonly path: string;
    };
  };
}

export interface ApiGatewayProxyResultV2 {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly isBase64Encoded: false;
}
