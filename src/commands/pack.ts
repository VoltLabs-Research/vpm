import * as fs from 'node:fs';
import * as path from 'node:path';
import * as tar from 'tar';
import type { Command } from 'commander';
import kleur from 'kleur';
import { findManifest, loadManifest } from '../lib/manifest.js';
import { logger } from '../lib/logger.js';

const DEFAULT_FILES = ['vpm.json', 'README.md', 'LICENSE', 'dist', 'bin'];

const expandFiles = (dir: string, patterns: string[]): string[] => {
    const result = new Set<string>();
    for (const pattern of patterns) {
        const candidate = path.join(dir, pattern);
        if (!fs.existsSync(candidate)) {
            continue;
        }
        result.add(pattern);
    }
    return Array.from(result);
};

export const register = (program: Command): void => {
    program
        .command('pack')
        .description('Create a tarball from the current package directory')
        .argument('[dir]', 'package directory', '.')
        .option('--out <file>', 'output tarball path')
        .action(async (dir: string, opts: { out?: string }) => {
            const absDir = path.resolve(dir);
            const manifestFile = findManifest(absDir);
            if (!manifestFile) {
                logger.error(`No vpm.json found near ${absDir}`);
                process.exitCode = 1;
                return;
            }
            const manifest = loadManifest(manifestFile);
            const baseDir = path.dirname(manifestFile);
            const filePatterns = manifest.files && manifest.files.length > 0
                ? Array.from(new Set([...DEFAULT_FILES.filter((f) => f === 'vpm.json'), ...manifest.files]))
                : DEFAULT_FILES;
            const entries = expandFiles(baseDir, filePatterns);
            if (entries.length === 0) {
                logger.error('No files matched for packing.');
                process.exitCode = 1;
                return;
            }
            const baseName = manifest.name.replace(/^@/, '').replace('/', '-');
            const outFile = opts.out
                ? path.resolve(opts.out)
                : path.resolve(process.cwd(), `${baseName}-${manifest.version}.tgz`);
            await tar.c(
                {
                    file: outFile,
                    cwd: baseDir,
                    gzip: true,
                    portable: true
                },
                entries
            );
            const stat = fs.statSync(outFile);
            logger.success(`Wrote ${kleur.cyan(outFile)} (${stat.size} bytes)`);
        });
};
