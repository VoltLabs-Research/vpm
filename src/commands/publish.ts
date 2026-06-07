import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import kleur from 'kleur';
import { FormData } from 'undici';
import { findManifest, loadManifest } from '../lib/manifest.js';
import { RegistryClient } from '../lib/registry-client.js';
import { resolveBearer } from '../lib/credentials.js';
import { logger } from '../lib/logger.js';

const BUNDLE_EXTENSIONS = ['.tgz', '.tar.gz', '.tar.zst'];

interface ResolvedBundle {
    tag: string;
    path: string;
    buffer: Buffer;
}

const collectBundle = (value: string, previous: string[]): string[] => {
    previous.push(value);
    return previous;
};

const tagFromFilename = (filename: string): string => filename.split('.')[0];

const discoverBundles = (bundleDir: string): { tag: string; path: string }[] => {
    if (!fs.existsSync(bundleDir)) {
        return [];
    }
    const found: { tag: string; path: string }[] = [];
    for (const entry of fs.readdirSync(bundleDir)) {
        const match = BUNDLE_EXTENSIONS.some((ext) => entry.endsWith(ext));
        if (!match) {
            continue;
        }
        const tag = tagFromFilename(entry);
        if (!tag) {
            continue;
        }
        found.push({ tag, path: path.join(bundleDir, entry) });
    }
    return found;
};

export const register = (program: Command): void => {
    program
        .command('publish')
        .description('Publish a package to the VoltCloud registry')
        .argument('[dir]', 'package directory', '.')
        .option('--token <token>', 'override the bearer token used for publish')
        .option(
            '--bundle <tag=path...>',
            "platform bundle as '<tag>=<path>' (repeatable)",
            collectBundle,
            [] as string[]
        )
        .option('--bundle-dir <dir>', 'directory to auto-discover platform bundles')
        .option('--dry-run', 'resolve and report without uploading')
        .action(
            async (
                dir: string,
                opts: { token?: string; bundle: string[]; bundleDir?: string; dryRun?: boolean }
            ) => {
                const absDir = path.resolve(dir ?? '.');
                const manifestFile = findManifest(absDir);
                if (!manifestFile) {
                    logger.error(`No vpm.json found near ${absDir}`);
                    process.exitCode = 1;
                    return;
                }
                const manifest = loadManifest(manifestFile);
                const baseDir = path.dirname(manifestFile);

                const nameMatch = /^@([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9._-]*)$/.exec(manifest.name);
                if (!nameMatch) {
                    logger.error(`Manifest name '${manifest.name}' is not in '@username/name' form`);
                    process.exitCode = 1;
                    return;
                }
                const username = nameMatch[1];
                const name = nameMatch[2];

                let bundleSources: { tag: string; path: string }[] = [];
                if (opts.bundle.length > 0) {
                    for (const entry of opts.bundle) {
                        const eq = entry.indexOf('=');
                        if (eq === -1) {
                            logger.error(`Invalid --bundle '${entry}'. Use '<tag>=<path>'.`);
                            process.exitCode = 1;
                            return;
                        }
                        const tag = entry.slice(0, eq).trim();
                        const bundlePath = entry.slice(eq + 1).trim();
                        if (!tag || !bundlePath) {
                            logger.error(`Invalid --bundle '${entry}'. Use '<tag>=<path>'.`);
                            process.exitCode = 1;
                            return;
                        }
                        bundleSources.push({ tag, path: path.resolve(bundlePath) });
                    }
                } else {
                    const bundleDir = opts.bundleDir
                        ? path.resolve(opts.bundleDir)
                        : path.join(baseDir, 'bundles');
                    bundleSources = discoverBundles(bundleDir);
                }

                const bundles: ResolvedBundle[] = [];
                for (const source of bundleSources) {
                    if (!fs.existsSync(source.path)) {
                        logger.error(`Bundle for '${source.tag}' not found at ${source.path}`);
                        process.exitCode = 1;
                        return;
                    }
                    bundles.push({
                        tag: source.tag,
                        path: source.path,
                        buffer: fs.readFileSync(source.path)
                    });
                }

                if (manifest.platforms && manifest.platforms.length > 0) {
                    const present = new Set(bundles.map((b) => b.tag));
                    const missing = manifest.platforms.filter((p) => !present.has(p));
                    if (missing.length > 0) {
                        logger.error(`Missing bundle(s) for platform(s): ${missing.join(', ')}`);
                        process.exitCode = 1;
                        return;
                    }
                } else if (bundles.length === 0) {
                    logger.error(
                        'no platform bundles found (pass --bundle <tag>=<path> or put files in ./bundles)'
                    );
                    process.exitCode = 1;
                    return;
                }

                let readme: string | undefined;
                const readmePath = path.join(baseDir, 'README.md');
                if (fs.existsSync(readmePath)) {
                    readme = fs.readFileSync(readmePath, 'utf8');
                }

                const bearer = await resolveBearer(opts.token);
                if (!bearer) {
                    logger.error('Not authenticated. Run `vpm login` or pass --token');
                    process.exitCode = 1;
                    return;
                }

                if (opts.dryRun) {
                    logger.info(`${kleur.bold().cyan(manifest.name)}@${kleur.bold(manifest.version)}`);
                    logger.info(`${kleur.gray('platforms:')}`);
                    for (const bundle of bundles) {
                        logger.info(`  ${kleur.cyan(bundle.tag)}: ${bundle.buffer.length} bytes`);
                    }
                    logger.info(`${kleur.gray('readme:')} ${readme ? 'yes' : 'no'}`);
                    logger.info(kleur.gray('dry-run: nothing uploaded'));
                    return;
                }

                const form = new FormData();
                form.append('manifest', JSON.stringify(manifest));
                if (readme) {
                    form.append('readme', readme);
                }
                for (const bundle of bundles) {
                    form.append(bundle.tag, new Blob([bundle.buffer]), `${bundle.tag}.tgz`);
                }

                try {
                    const client = new RegistryClient();
                    const result = await client.publish(username, name, form, bearer);
                    logger.success(`Published ${manifest.name}@${manifest.version}`);
                    const latest = result.distTags?.latest;
                    if (latest) {
                        logger.info(`${kleur.gray('latest:')} ${latest}`);
                    }
                } catch (err) {
                    logger.error((err as Error).message);
                    process.exitCode = 1;
                }
            }
        );
};
