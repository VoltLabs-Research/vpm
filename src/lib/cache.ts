import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getConfig } from './config.js';

const defaultCacheDir = (): string => {
    const xdg = process.env.XDG_CACHE_HOME;
    const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.cache');
    return path.join(base, 'volt');
};

export const rootCacheDir = (): string => {
    const cfg = getConfig();
    return cfg.cacheDir ? path.resolve(cfg.cacheDir) : defaultCacheDir();
};

export const pluginsDir = (): string => path.join(rootCacheDir(), 'plugins');

export const downloadsDir = (): string => path.join(rootCacheDir(), 'downloads');

export const manifestsDir = (): string => path.join(rootCacheDir(), 'manifests');

export const configPath = (): string => path.join(rootCacheDir(), 'config.json');

export const installDir = (
    publisher: string,
    key: string,
    version: string,
    platform: string
): string => path.join(pluginsDir(), publisher, key, version, platform);

export const installRoot = (publisher: string, key: string): string =>
    path.join(pluginsDir(), publisher, key);

export const manifestPath = (scope: string, name: string): string =>
    path.join(manifestsDir(), scope, `${name}.json`);

export const ensureDir = (dir: string): void => {
    fs.mkdirSync(dir, { recursive: true });
};

export const writeJson = (file: string, data: unknown): void => {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
};

export const readJson = <T>(file: string): T | undefined => {
    if (!fs.existsSync(file)) {
        return undefined;
    }
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as T;
};

export const removeRecursive = (target: string): void => {
    fs.rmSync(target, { recursive: true, force: true });
};

export const listInstalledPublishers = (): string[] => {
    const dir = pluginsDir();
    if (!fs.existsSync(dir)) {
        return [];
    }
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
};

export interface InstalledRecord {
    publisher: string;
    key: string;
    version: string;
    platforms: string[];
}

export const listInstalled = (): InstalledRecord[] => {
    const dir = pluginsDir();
    if (!fs.existsSync(dir)) {
        return [];
    }
    const records: InstalledRecord[] = [];
    for (const publisher of fs.readdirSync(dir)) {
        const publisherDir = path.join(dir, publisher);
        if (!fs.statSync(publisherDir).isDirectory()) {
            continue;
        }
        for (const key of fs.readdirSync(publisherDir)) {
            const keyDir = path.join(publisherDir, key);
            if (!fs.statSync(keyDir).isDirectory()) {
                continue;
            }
            for (const version of fs.readdirSync(keyDir)) {
                const versionDir = path.join(keyDir, version);
                if (!fs.statSync(versionDir).isDirectory()) {
                    continue;
                }
                const platforms = fs
                    .readdirSync(versionDir, { withFileTypes: true })
                    .filter((entry) => entry.isDirectory())
                    .map((entry) => entry.name);
                records.push({ publisher, key, version, platforms });
            }
        }
    }
    return records;
};
