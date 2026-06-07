import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import kleur from 'kleur';
import { resolveKey, splitVersionSpec } from '../lib/key-resolver.js';
import { installRoot, manifestPath, removeRecursive } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

export const register = (program: Command): void => {
    program
        .command('uninstall')
        .alias('rm')
        .description('Remove a plugin from the shared Volt cache')
        .argument('<pkg>', '@username/name[@version]')
        .action(async (pkg: string) => {
            const { ref, version } = splitVersionSpec(pkg);
            const key = resolveKey(ref);
            const root = installRoot(key.username, key.name);
            if (!fs.existsSync(root)) {
                logger.info(`${kleur.cyan(key.fullName)} is not installed.`);
                return;
            }
            if (version) {
                const target = path.join(root, version);
                if (!fs.existsSync(target)) {
                    logger.info(`${kleur.cyan(key.fullName)}@${version} is not installed.`);
                    return;
                }
                removeRecursive(target);
                logger.success(`Removed ${kleur.cyan(key.fullName)}@${version}`);
            } else {
                removeRecursive(root);
                logger.success(`Removed ${kleur.cyan(key.fullName)} (all versions)`);
            }
            const mf = manifestPath(key.username, key.name);
            if (fs.existsSync(mf) && !fs.existsSync(root)) {
                fs.unlinkSync(mf);
            }
        });
};
