import { request, type Dispatcher } from 'undici';

export interface HttpRequestOptions {
    method?: Dispatcher.HttpMethod;
    headers?: Record<string, string>;
    body?: unknown;
    query?: Record<string, string | number | undefined>;
    expectStatus?: number[];
    bearer?: string;
}

export class HttpError extends Error {
    readonly status: number;
    readonly body: unknown;

    constructor(status: number, message: string, body: unknown) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.body = body;
    }
}

const buildUrl = (base: string, pathname: string, query?: Record<string, string | number | undefined>): string => {
    const url = new URL(pathname, base.endsWith('/') ? base : base + '/');
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined) {
                continue;
            }
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
};

export const httpJson = async <T>(
    base: string,
    pathname: string,
    opts: HttpRequestOptions = {}
): Promise<T> => {
    const url = buildUrl(base, pathname.replace(/^\//, ''), opts.query);
    const headers: Record<string, string> = {
        accept: 'application/json',
        ...(opts.headers ?? {})
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
        body = JSON.stringify(opts.body);
        headers['content-type'] = 'application/json';
    }
    if (opts.bearer) {
        headers['authorization'] = `Bearer ${opts.bearer}`;
    }
    const response = await request(url, {
        method: opts.method ?? 'GET',
        headers,
        body
    });
    const text = await response.body.text();
    const acceptable = opts.expectStatus ?? [200, 201, 204];
    let parsed: unknown = undefined;
    if (text.length > 0) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = text;
        }
    }
    if (!acceptable.includes(response.statusCode)) {
        const message =
            parsed && typeof parsed === 'object' && 'error' in (parsed as Record<string, unknown>)
                ? String((parsed as Record<string, unknown>).error)
                : `HTTP ${response.statusCode}`;
        throw new HttpError(response.statusCode, message, parsed);
    }
    return parsed as T;
};

export interface RawResponse {
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: Buffer;
}

export const httpRaw = async (
    base: string,
    pathname: string,
    opts: HttpRequestOptions = {}
): Promise<RawResponse> => {
    const url = buildUrl(base, pathname.replace(/^\//, ''), opts.query);
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.bearer) {
        headers['authorization'] = `Bearer ${opts.bearer}`;
    }
    let body: string | undefined;
    if (opts.body !== undefined) {
        body = JSON.stringify(opts.body);
        headers['content-type'] = 'application/json';
    }
    const response = await request(url, {
        method: opts.method ?? 'GET',
        headers,
        body
    });
    const chunks: Buffer[] = [];
    for await (const chunk of response.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return {
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
    };
};
