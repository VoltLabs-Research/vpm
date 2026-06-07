import type { Command } from 'commander';
import { RegistryClient } from '../lib/registry-client.js';
import { resolveBearer } from '../lib/credentials.js';
import { resolveKey, splitVersionSpec } from '../lib/key-resolver.js';
import { logger } from '../lib/logger.js';

export const register = (program: Command): void => {
    program
        .command('deprecate')
        .description('Mark a published version as deprecated with a message')
        .argument('<pkg>', '@username/name@version')
        .argument('<message>', 'deprecation message')
        .option('--token <token>', 'override the bearer token used for deprecate')
        .action(async (pkg: string, message: string, opts: { token?: string }) => {
            const { ref, version } = splitVersionSpec(pkg);
            if (!version) {
                logger.error('A version is required to deprecate. Use @username/name@version');
                process.exitCode = 1;
                return;
            }
            const key = resolveKey(ref);
            const bearer = await resolveBearer(opts.token);
            if (!bearer) {
                logger.error('Not authenticated. Run `vpm login` or pass --token');
                process.exitCode = 1;
                return;
            }
            const client = new RegistryClient();
            await client.deprecate(key.username, key.name, version, message, bearer);
            logger.success(`Deprecated ${key.fullName}@${version}`);
        });
};
