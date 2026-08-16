import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import { findManifest, loadManifest } from '../lib/manifest.js';
import { logger } from '../lib/logger.js';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const RELEASE_TYPES = ['major', 'minor', 'patch'] as const;

type ReleaseType = (typeof RELEASE_TYPES)[number];

const isReleaseType = (value: string): value is ReleaseType =>
    (RELEASE_TYPES as readonly string[]).includes(value);

const bump = (current: string, release: ReleaseType): string => {
    const parsed = SEMVER.exec(current);
    if (!parsed) {
        throw new Error(`cannot bump non-semver version '${current}'`);
    }
    const [major, minor, patch] = parsed.slice(1).map(Number);
    if (release === 'major') {
        return `${major + 1}.0.0`;
    }
    if (release === 'minor') {
        return `${major}.${minor + 1}.0`;
    }
    return `${major}.${minor}.${patch + 1}`;
};

const findModifier = (doc: any): any => {
    for (const node of doc?.workflow?.nodes ?? []) {
        const modifier = node?.data?.modifier;
        if (modifier && typeof modifier === 'object') {
            return modifier;
        }
    }
    return undefined;
};

const patchVersionString = (raw: string, expected: unknown, version: string): string | undefined => {
    const pattern = /"version"(\s*):(\s*)"[^"]*"/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
        const candidate =
            raw.slice(0, match.index) +
            `"version"${match[1]}:${match[2]}"${version}"` +
            raw.slice(match.index + match[0].length);
        try {
            if (JSON.stringify(JSON.parse(candidate)) === JSON.stringify(expected)) {
                return candidate;
            }
        } catch {
            continue;
        }
    }
    return undefined;
};

const rewrite = (file: string, version: string, mutate: (doc: any) => boolean): boolean => {
    const raw = fs.readFileSync(file, 'utf8');
    const expected = JSON.parse(raw);
    if (!mutate(expected)) {
        return false;
    }
    const patched = patchVersionString(raw, expected, version);
    if (!patched) {
        throw new Error(`could not locate the version field to update in ${file}`);
    }
    fs.writeFileSync(file, patched, 'utf8');
    return true;
};

export const register = (program: Command): void => {
    program
        .command('version')
        .description('Set the package version in vpm.json and mirror it into plugin.json')
        .argument('[target]', 'major | minor | patch | an explicit x.y.z')
        .option('-C, --dir <path>', 'package directory', '.')
        .option('--check', 'report drift between vpm.json and plugin.json without writing')
        .action((target: string | undefined, opts: { dir: string; check?: boolean }) => {
            const absDir = path.resolve(opts.dir);
            const manifestFile = findManifest(absDir);
            if (!manifestFile) {
                logger.error(`No vpm.json found near ${absDir}`);
                process.exitCode = 1;
                return;
            }
            const manifest = loadManifest(manifestFile);
            const baseDir = path.dirname(manifestFile);
            const workflowFile = path.join(baseDir, 'plugin.json');
            const hasWorkflow = fs.existsSync(workflowFile);

            if (opts.check) {
                if (!hasWorkflow) {
                    logger.info(`${manifest.name} ${manifest.version} (no plugin.json to mirror)`);
                    return;
                }
                const modifier = findModifier(JSON.parse(fs.readFileSync(workflowFile, 'utf8')));
                const mirrored = modifier?.version;
                if (mirrored === undefined || mirrored === manifest.version) {
                    logger.success(`${manifest.name} ${manifest.version} is in sync`);
                    return;
                }
                logger.error(
                    `${manifest.name}: vpm.json is ${manifest.version} but plugin.json is ${mirrored}`
                );
                process.exitCode = 1;
                return;
            }

            if (!target) {
                logger.error('a target version is required: major | minor | patch | x.y.z');
                process.exitCode = 1;
                return;
            }

            let next: string;
            try {
                next = isReleaseType(target) ? bump(manifest.version, target) : target;
            } catch (err) {
                logger.error((err as Error).message);
                process.exitCode = 1;
                return;
            }
            if (!SEMVER.test(next)) {
                logger.error(`invalid version '${next}'; expected x.y.z`);
                process.exitCode = 1;
                return;
            }

            try {
                rewrite(manifestFile, next, (doc) => {
                    doc.version = next;
                    return true;
                });
                logger.success(`vpm.json ${manifest.version} -> ${next}`);

                if (hasWorkflow) {
                    const mirrored = rewrite(workflowFile, next, (doc) => {
                        const modifier = findModifier(doc);
                        if (!modifier || modifier.version === undefined) {
                            return false;
                        }
                        modifier.version = next;
                        return true;
                    });
                    if (mirrored) {
                        logger.success(`plugin.json mirrored to ${next}`);
                    } else {
                        logger.info('plugin.json carries no modifier version; nothing to mirror');
                    }
                }
            } catch (err) {
                logger.error((err as Error).message);
                process.exitCode = 1;
            }
        });
};
