import { LIMITS } from '../validation/limits.ts';
import { errorResponse } from '../http/respond.ts';
import type {
  ApiGatewayProxyEventV2,
  ApiGatewayProxyResultV2,
  HttpHandler,
  HttpMethod,
  HttpRequest,
} from '../http/types.ts';

/**
 * Translates an API Gateway HTTP API payload v2.0 event into the narrow
 * `HttpRequest` the handlers accept.
 *
 * Two things happen here deliberately:
 *
 * - Headers, cookies, source IP and user agent are dropped and never copied
 *   into the request object, so no downstream code can read them.
 * - The body is base64-decoded when the gateway says it is encoded. API Gateway
 *   base64-encodes a body whose content type it does not recognise as text,
 *   which includes a request sent without a `content-type` header, so skipping
 *   this step would fail exactly those callers a browser never produces.
 */

export type RequestTranslation =
  | { readonly ok: true; readonly request: HttpRequest }
  | { readonly ok: false; readonly reason: 'METHOD_NOT_ALLOWED' | 'PAYLOAD_TOO_LARGE' | 'BAD_REQUEST' };

function isSupportedMethod(method: string): method is HttpMethod {
  return method === 'GET' || method === 'POST';
}

export function toHttpRequest(event: ApiGatewayProxyEventV2): RequestTranslation {
  const method = event.requestContext.http.method.toUpperCase();
  if (!isSupportedMethod(method)) {
    return { ok: false, reason: 'METHOD_NOT_ALLOWED' };
  }

  let body: string | undefined;
  const raw = event.body;
  if (raw !== null && raw !== undefined && raw.length > 0) {
    if (event.isBase64Encoded === true) {
      let decoded: Buffer;
      try {
        decoded = Buffer.from(raw, 'base64');
      } catch {
        return { ok: false, reason: 'BAD_REQUEST' };
      }
      if (decoded.byteLength > LIMITS.maxBodyBytes) {
        return { ok: false, reason: 'PAYLOAD_TOO_LARGE' };
      }
      body = decoded.toString('utf8');
    } else {
      if (Buffer.byteLength(raw, 'utf8') > LIMITS.maxBodyBytes) {
        return { ok: false, reason: 'PAYLOAD_TOO_LARGE' };
      }
      body = raw;
    }
  }

  return {
    ok: true,
    request: {
      method,
      routeKey: event.routeKey,
      pathParameters: Object.freeze({ ...(event.pathParameters ?? {}) }),
      queryParameters: Object.freeze({ ...(event.queryStringParameters ?? {}) }),
      body,
      requestId: event.requestContext.requestId,
    },
  };
}

export type LambdaHandler = (event: ApiGatewayProxyEventV2) => Promise<ApiGatewayProxyResultV2>;

/** Wraps a transport-free handler as a Lambda entry point. */
export function createLambdaHandler(handler: HttpHandler): LambdaHandler {
  return async (event: ApiGatewayProxyEventV2): Promise<ApiGatewayProxyResultV2> => {
    const translation = toHttpRequest(event);
    const response = translation.ok
      ? await handler(translation.request)
      : errorResponse(translation.reason);

    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body,
      isBase64Encoded: false,
    };
  };
}
