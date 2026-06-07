import type { Command } from 'commander';
import { writeScaffold } from '../lib/manifest.js';
import { PackageKindSchema } from '../lib/types.js';
import { logger } from '../lib/logger.js';

export const register = (program: Command): void => {
    program
        .command('init')
        .description('Create a vpm.json manifest in the current directory')
        .option('--kind <kind>', 'package kind: workflow | engine | lib', 'lib')
        .option('--name <name>', '@username/name')
        .option('--version <version>', 'initial version', '0.1.0')
        .option('--publisher <publisher>', 'publisher (defaults to username)')
        .option('--description <description>', 'short description')
        .action(async (opts: {
            kind: string;
            name?: string;
            version?: string;
            publisher?: string;
            description?: string;
        }) => {
            if (!opts.name) {
                logger.error('--name is required (e.g. --name=@voltstack/my-plugin)');
                process.exitCode = 1;
                return;
            }
            const kindParsed = PackageKindSchema.safeParse(opts.kind);
            if (!kindParsed.success) {
                logger.error(`invalid --kind '${opts.kind}'; expected workflow | engine | lib`);
                process.exitCode = 1;
                return;
            }
            const target = writeScaffold(process.cwd(), {
                kind: kindParsed.data,
                name: opts.name,
                version: opts.version,
                publisher: opts.publisher,
                description: opts.description
            });
            logger.success(`Wrote ${target}`);
        });
};
