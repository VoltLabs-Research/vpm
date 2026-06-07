import { request, type FormData } from 'undici';
import { getConfig } from './config.js';
import { httpJson, httpRaw } from './http.js';
import type { Packument, SearchResult, VersionMetadata } from './types.js';

export interface SearchOptions {
    kind?: string;
    page?: number;
    pageSize?: number;
}

export class RegistryClient {
    private readonly baseUrl: string;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl ?? getConfig().registryUrl;
    }

    async search(q: string, opts: SearchOptions = {}, bearer?: string): Promise<SearchResult> {
        return httpJson<SearchResult>(this.baseUrl, '/-/search', {
            query: { q, kind: opts.kind, page: opts.page, pageSize: opts.pageSize },
            bearer
        });
    }

    async getPackument(username: string, name: string, bearer?: string): Promise<Packument> {
        return httpJson<Packument>(
            this.baseUrl,
            `/packages/${encodeURIComponent(username)}/${encodeURIComponent(name)}`,
            { bearer }
        );
    }

    async getVersion(
        username: string,
        name: string,
        version: string,
        bearer?: string
    ): Promise<VersionMetadata> {
        return httpJson<VersionMetadata>(
            this.baseUrl,
            `/packages/${encodeURIComponent(username)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
            { bearer }
        );
    }

    async getDownloadUrl(
        username: string,
        name: string,
        version: string,
        platform: string,
        bearer?: string
    ): Promise<string> {
        const response = await httpRaw(
            this.baseUrl,
            `/packages/${encodeURIComponent(username)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/-/${encodeURIComponent(platform)}.tgz`,
            { bearer }
        );
        if (response.statusCode === 307 || response.statusCode === 302) {
            const location = response.headers['location'];
            if (typeof location === 'string') {
                return location;
            }
            if (Array.isArray(location) && location[0]) {
                return location[0];
            }
            throw new Error('Registry returned redirect without Location header');
        }
        if (response.statusCode === 200) {
            throw new Error(
                'Registry returned bundle inline; expected 307 redirect to signed URL'
            );
        }
        throw new Error(`Registry download failed (status ${response.statusCode})`);
    }

    async whoamiProxy(bearer: string): Promise<unknown> {
        return httpJson(this.baseUrl, '/-/whoami', { bearer });
    }

    async publish(username: string, name: string, form: FormData, bearer: string): Promise<Packument> {
        const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
        const url = `${base}/packages/${encodeURIComponent(username)}/${encodeURIComponent(name)}`;
        const response = await request(url, {
            method: 'PUT',
            body: form,
            headers: { authorization: `Bearer ${bearer}` }
        });
        const text = await response.body.text();
        if (response.statusCode === 201) {
            return JSON.parse(text) as Packument;
        }
        let serverMessage: string | undefined;
        if (text.length > 0) {
            try {
                const parsed = JSON.parse(text) as Record<string, unknown>;
                if (typeof parsed.message === 'string') {
                    serverMessage = parsed.message;
                } else if (typeof parsed.error === 'string') {
                    serverMessage = parsed.error;
                }
            } catch {
                serverMessage = text;
            }
        }
        const fallback =
            response.statusCode === 409
                ? 'version already exists'
                : response.statusCode === 403
                  ? `not authorized to publish to @${username}`
                  : response.statusCode === 422
                    ? 'invalid manifest'
                    : response.statusCode === 401
                      ? 'bad or missing token'
                      : 'publish failed';
        throw new Error(`Publish failed (HTTP ${response.statusCode}): ${serverMessage ?? fallback}`);
    }

    async deprecate(
        username: string,
        name: string,
        version: string,
        reason: string,
        bearer: string
    ): Promise<unknown> {
        return httpJson(
            this.baseUrl,
            `/packages/${encodeURIComponent(username)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/deprecate`,
            {
                method: 'POST',
                body: { reason },
                bearer,
                expectStatus: [200]
            }
        );
    }
}
