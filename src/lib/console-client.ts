import { getConfig } from './config.js';
import { httpJson, HttpError } from './http.js';
import type {
    AuthTokens,
    DeviceCodeStart,
    PatCreateResponse,
    PatRecord,
    WhoamiResponse
} from './types.js';

export class ConsoleClient {
    private readonly baseUrl: string;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl ?? getConfig().consoleUrl;
    }

    async login(email: string, password: string): Promise<AuthTokens> {
        return httpJson<AuthTokens>(this.baseUrl, '/auth/login', {
            method: 'POST',
            body: { email, password }
        });
    }

    async refresh(refreshToken: string): Promise<Pick<AuthTokens, 'accessToken' | 'expiresIn'>> {
        return httpJson(this.baseUrl, '/auth/refresh', {
            method: 'POST',
            body: { refreshToken }
        });
    }

    async logout(refreshToken: string): Promise<void> {
        await httpJson(this.baseUrl, '/auth/logout', {
            method: 'POST',
            body: { refreshToken },
            expectStatus: [200, 204]
        });
    }

    async deviceCodeStart(): Promise<DeviceCodeStart> {
        return httpJson<DeviceCodeStart>(this.baseUrl, '/auth/device-code', {
            method: 'POST'
        });
    }

    async deviceCodePoll(deviceCode: string): Promise<AuthTokens | 'pending'> {
        try {
            return await httpJson<AuthTokens>(this.baseUrl, '/auth/device-token', {
                method: 'POST',
                body: { deviceCode },
                expectStatus: [200]
            });
        } catch (err) {
            if (err instanceof HttpError && err.status === 428) {
                return 'pending';
            }
            throw err;
        }
    }

    async whoami(bearer: string): Promise<WhoamiResponse> {
        return httpJson<WhoamiResponse>(this.baseUrl, '/auth/whoami', { bearer });
    }

    async listTokens(bearer: string): Promise<PatRecord[]> {
        return httpJson<PatRecord[]>(this.baseUrl, '/auth/tokens', { bearer });
    }

    async createToken(
        bearer: string,
        body: { label: string; scopes: string[]; scopeMask?: number; expiresAt?: string }
    ): Promise<PatCreateResponse> {
        return httpJson<PatCreateResponse>(this.baseUrl, '/auth/tokens', {
            method: 'POST',
            bearer,
            body,
            expectStatus: [200, 201]
        });
    }

    async revokeToken(bearer: string, id: string): Promise<void> {
        await httpJson(this.baseUrl, `/auth/tokens/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            bearer,
            expectStatus: [200, 204]
        });
    }
}
