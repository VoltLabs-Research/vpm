import * as fs from 'node:fs';
import * as path from 'node:path';
import { request } from 'undici';
import semver from 'semver';
import ora from 'ora';
import kleur from 'kleur';
import type { Command } from 'commander';
import { RegistryClient } from '../lib/registry-client.js';
import { currentBearerToken } from '../lib/credentials.js';
import { resolveKey, splitVersionSpec } from '../lib/key-resolver.js';
import { currentPlatformTag } from '../lib/platform.js';
import {
    downloadsDir,
    ensureDir,
    installDir,
    manifestPath,
    writeJson
} from '../lib/cache.js';
import { extractArchive, ensureExecutable } from '../lib/extract.js';
import { logger } from '../lib/logger.js';
import type { Packument, VersionMetadata } from '../lib/types.js';

const pickVersion = (pack: Packument, spec?: string): string => {
    if (!spec) {
        const latest = pack.distTags.latest;
        if (!latest) {
            throw new Error(`No 'latest' dist-tag for ${pack.fullName}`);
        }
        return latest;
    }
    if (pack.distTags[spec]) {
        return pack.distTags[spec];
    }
    if (semver.valid(spec)) {
        if (!pack.versions[spec]) {
            throw new Error(`Version '${spec}' not found for ${pack.fullName}`);
        }
        return spec;
    }
    if (semver.validRange(spec)) {
        const candidate = semver.maxSatisfying(Object.keys(pack.versions), spec);
        if (!candidate) {
            throw new Error(`No version of ${pack.fullName} satisfies '${spec}'`);
        }
        return candidate;
    }
    throw new Error(`Invalid version specifier '${spec}'`);
};

const downloadToFile = async (url: string, target: string): Promise<void> => {
    const response = await request(url);
    if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`Download failed: HTTP ${response.statusCode} for ${url}`);
    }
    ensureDir(path.dirname(target));
    const file = fs.createWriteStream(target);
    for await (const chunk of response.body) {
        file.write(chunk);
    }
    await new Promise<void>((resolve, reject) => {
        file.end((err?: NodeJS.ErrnoException | null) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

const writeWorkflowManifestCache = (username: string, name: string, version: VersionMetadata): void => {
    const target = manifestPath(username, name);
    writeJson(target, version.manifest);
};

export const register = (program: Command): void => {
    program
        .command('install')
        .alias('i')
        .description('Download and extract a plugin into the shared Volt cache')
        .argument('<pkg>', '@username/name[@version|@tag|@range]')
        .option('--global', 'install globally (default; reserved for compatibility)')
        .option('--platform <tag>', 'override platform tag (e.g. linux-x86_64)')
        .option('--force', 'reinstall even if the target version is already present')
        .action(async (pkg: string, opts: { global?: boolean; platform?: string; force?: boolean }) => {
            void opts.global;
            const { ref, version: spec } = splitVersionSpec(pkg);
            const key = resolveKey(ref);
            const platform = opts.platform ?? currentPlatformTag();
            const client = new RegistryClient();
            const bearer = await currentBearerToken();

            const spinner = ora(`Resolving ${kleur.cyan(key.fullName)}…`).start();
            let pack: Packument;
            try {
                pack = await client.getPackument(key.username, key.name, bearer);
            } catch (err) {
                spinner.fail('Failed to resolve packument');
                throw err;
            }
            const version = pickVersion(pack, spec);
            const publisher = pack.versions[version]?.manifest.publisher ?? key.username;
            const target = installDir(publisher, key.name, version, platform);
            if (fs.existsSync(target) && !opts.force) {
                spinner.succeed(`${kleur.cyan(key.fullName)}@${version} already installed (${platform})`);
                return;
            }
            spinner.text = `Fetching metadata for ${version}…`;
            const meta = await client.getVersion(key.username, key.name, version, bearer);
            const platformAsset = meta.platforms.find((p) => p.tag === platform);
            if (!platformAsset && meta.platforms.length > 0) {
                spinner.fail(
                    `No bundle for platform '${platform}'. Available: ${meta.platforms.map((p) => p.tag).join(', ')}`
                );
                process.exitCode = 1;
                return;
            }
            const downloadPlatform = platformAsset?.tag ?? platform;
            spinner.text = `Downloading ${kleur.cyan(key.fullName)}@${version} (${downloadPlatform})…`;
            const signed = await client.getDownloadUrl(key.username, key.name, version, downloadPlatform, bearer);
            const archive = path.join(
                downloadsDir(),
                `${key.username}-${key.name}-${version}-${downloadPlatform}.tgz`
            );
            ensureDir(downloadsDir());
            await downloadToFile(signed, archive);
            spinner.text = `Extracting into ${target}…`;
            if (fs.existsSync(target)) {
                fs.rmSync(target, { recursive: true, force: true });
            }
            await extractArchive(archive, target);
            ensureExecutable(path.join(target, 'bin'));
            ensureExecutable(path.join(target, 'scripts'));
            if (meta.manifest.kind === 'workflow') {
                writeWorkflowManifestCache(key.username, key.name, meta);
            }
            spinner.succeed(`Installed ${kleur.cyan(key.fullName)}@${version} (${downloadPlatform})`);
            if (meta.deprecated) {
                logger.warn(`${key.fullName}@${version} is deprecated: ${meta.deprecated.reason}`);
            }
        });
};
