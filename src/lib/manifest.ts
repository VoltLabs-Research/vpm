import * as fs from 'node:fs';
import * as path from 'node:path';
import { VpmManifestSchema, type PackageKind, type VpmManifest } from './types.js';

const MANIFEST_FILENAME = 'vpm.json';

export const findManifest = (dir: string): string | undefined => {
    let current = path.resolve(dir);
    const root = path.parse(current).root;
    while (current && current !== root) {
        const candidate = path.join(current, MANIFEST_FILENAME);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
    const rootCandidate = path.join(root, MANIFEST_FILENAME);
    return fs.existsSync(rootCandidate) ? rootCandidate : undefined;
};

export const loadManifest = (file: string): VpmManifest => {
    if (!fs.existsSync(file)) {
        throw new Error(`Manifest not found at ${file}`);
    }
    const raw = fs.readFileSync(file, 'utf8');
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Invalid JSON in ${file}: ${(err as Error).message}`);
    }
    const parsed = VpmManifestSchema.safeParse(json);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('; ');
        throw new Error(`Invalid vpm.json: ${issues}`);
    }
    return parsed.data;
};

export interface ScaffoldOptions {
    kind: PackageKind;
    name: string;
    version?: string;
    publisher?: string;
    description?: string;
}

export const writeScaffold = (dir: string, opts: ScaffoldOptions): string => {
    const target = path.join(dir, MANIFEST_FILENAME);
    if (fs.existsSync(target)) {
        throw new Error(`vpm.json already exists at ${target}`);
    }
    const nameMatch = /^@([a-z0-9][a-z0-9-]*)\//.exec(opts.name);
    if (!nameMatch) {
        throw new Error(`Name must be in '@username/name' form, got '${opts.name}'`);
    }
    const manifest: VpmManifest = {
        name: opts.name,
        version: opts.version ?? '0.1.0',
        kind: opts.kind,
        publisher: opts.publisher ?? nameMatch[1],
        description: opts.description,
        license: 'MIT',
        files: ['dist', 'bin']
    };
    const validated = VpmManifestSchema.parse(manifest);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, JSON.stringify(validated, null, 2) + '\n', 'utf8');
    return target;
};
