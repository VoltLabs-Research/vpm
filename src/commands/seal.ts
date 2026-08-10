import * as path from 'node:path';
import type { Command } from 'commander';
import kleur from 'kleur';
import { findManifest, loadManifest } from '../lib/manifest.js';
import { sealBundle } from '../lib/interface.js';
import { logger } from '../lib/logger.js';

export const register = (program: Command): void => {
    program
        .command('seal')
        .description("Generate a bundle's interface.params from `<binary> --describe`")
        .argument('<bundle-dir...>', 'built bundle directories (each containing bin/ and plugin.json)')
        .option('--name <name>', 'plugin name used to disambiguate the entrypoint')
        .action(async (bundleDirs: string[], opts: { name?: string }) => {
            let name = opts.name;
            if (!name) {
                const manifestFile = findManifest(process.cwd());
                if (manifestFile) {
                    name = loadManifest(manifestFile).name;
                }
            }
            if (!name) {
                logger.error('Could not determine the plugin name. Pass --name @publisher/plugin.');
                process.exitCode = 1;
                return;
            }

            for (const bundleDir of bundleDirs) {
                const absDir = path.resolve(bundleDir);
                try {
                    const { options, checksum } = sealBundle(absDir, name);
                    logger.success(
                        `Sealed ${kleur.cyan(path.basename(absDir))}: ${options} options, ${checksum.slice(0, 19)}…`
                    );
                } catch (err) {
                    logger.error(`${path.basename(absDir)}: ${(err as Error).message}`);
                    process.exitCode = 1;
                    return;
                }
            }
        });
};
