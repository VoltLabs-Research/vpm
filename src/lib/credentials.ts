import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import type { StoredCredentials } from './types.js';

const SERVICE = 'voltcloud';
const ACCOUNT = 'default';

interface KeytarLike {
    getPassword: (service: string, account: string) => Promise<string | null>;
    setPassword: (service: string, account: string, password: string) => Promise<void>;
    deletePassword: (service: string, account: string) => Promise<boolean>;
}

let keytarCache: KeytarLike | null | undefined;

const loadKeytar = async (): Promise<KeytarLike | null> => {
    if (keytarCache !== undefined) {
        return keytarCache;
    }
    if (getConfig().noKeyring) {
        keytarCache = null;
        return null;
    }
    try {
        const mod = (await import('keytar')) as unknown as { default?: KeytarLike } & KeytarLike;
        keytarCache = (mod.default ?? mod) as KeytarLike;
        return keytarCache;
    } catch (err) {
        logger.debug(`keytar unavailable, using file fallback: ${(err as Error).message}`);
        keytarCache = null;
        return null;
    }
};

const fallbackPath = (): string => {
    const xdg = process.env.XDG_CONFIG_HOME;
    const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
    return path.join(base, 'vpm', 'credentials');
};

const readFallback = (): StoredCredentials => {
    const file = fallbackPath();
    if (!fs.existsSync(file)) {
        return {};
    }
    try {
        const raw = fs.readFileSync(file, 'utf8');
        return JSON.parse(raw) as StoredCredentials;
    } catch (err) {
        logger.warn(`failed to read credentials file: ${(err as Error).message}`);
        return {};
    }
};

const writeFallback = (data: StoredCredentials): void => {
    const file = fallbackPath();
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
};

const removeFallback = (): void => {
    const file = fallbackPath();
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
};

export const loadCredentials = async (): Promise<StoredCredentials> => {
    const keytar = await loadKeytar();
    if (keytar) {
        const raw = await keytar.getPassword(SERVICE, ACCOUNT);
        if (raw) {
            try {
                return JSON.parse(raw) as StoredCredentials;
            } catch {
                return {};
            }
        }
        return {};
    }
    return readFallback();
};

export const saveCredentials = async (creds: StoredCredentials): Promise<void> => {
    const keytar = await loadKeytar();
    const payload = JSON.stringify(creds);
    if (keytar) {
        await keytar.setPassword(SERVICE, ACCOUNT, payload);
        return;
    }
    writeFallback(creds);
};

export const clearCredentials = async (): Promise<void> => {
    const keytar = await loadKeytar();
    if (keytar) {
        try {
            await keytar.deletePassword(SERVICE, ACCOUNT);
        } catch (err) {
            logger.debug(`keytar delete failed: ${(err as Error).message}`);
        }
    }
    removeFallback();
};

export const currentBearerToken = async (): Promise<string | undefined> => {
    const creds = await loadCredentials();
    if (creds.pat) {
        return creds.pat;
    }
    if (creds.accessToken) {
        return creds.accessToken;
    }
    return undefined;
};

export const resolveBearer = async (overrideToken?: string): Promise<string | undefined> => {
    if (overrideToken) {
        return overrideToken;
    }
    return currentBearerToken();
};
