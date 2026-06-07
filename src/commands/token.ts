import type { Command } from 'commander';
import kleur from 'kleur';
import { ConsoleClient } from '../lib/console-client.js';
import { currentBearerToken } from '../lib/credentials.js';
import { logger } from '../lib/logger.js';

const requireBearer = async (): Promise<string> => {
    const bearer = await currentBearerToken();
    if (!bearer) {
        throw new Error('Not logged in. Run `vpm login` first.');
    }
    return bearer;
};

export const register = (program: Command): void => {
    const token = program
        .command('token')
        .description('Manage personal access tokens (PATs)');

    token
        .command('list')
        .alias('ls')
        .description('List your PATs')
        .option('--json', 'output raw JSON')
        .action(async (opts: { json?: boolean }) => {
            const bearer = await requireBearer();
            const client = new ConsoleClient();
            const records = await client.listTokens(bearer);
            if (opts.json) {
                logger.info(JSON.stringify(records, null, 2));
                return;
            }
            if (records.length === 0) {
                logger.info('No tokens.');
                return;
            }
            for (const rec of records) {
                logger.info(
                    `${kleur.bold(rec.label)} ${kleur.gray('(' + rec.id + ')')} • scopes: ${rec.scopes.join(', ') || '(none)'}`
                );
                if (rec.expiresAt) {
                    logger.info(`  ${kleur.gray('expires:')} ${rec.expiresAt}`);
                }
                if (rec.lastUsedAt) {
                    logger.info(`  ${kleur.gray('last used:')} ${rec.lastUsedAt}`);
                }
            }
        });

    token
        .command('create')
        .description('Create a new PAT')
        .requiredOption('--label <label>', 'human-readable label')
        .option('--scope <scope...>', 'one or more scopes (default: read)')
        .option('--scope-mask <mask>', 'numeric scope bitmask')
        .option('--expires <iso>', 'ISO 8601 expiry timestamp')
        .action(async (opts: { label: string; scope?: string[]; scopeMask?: string; expires?: string }) => {
            const bearer = await requireBearer();
            const client = new ConsoleClient();
            const scopes = opts.scope && opts.scope.length > 0 ? opts.scope : ['read'];
            const body: { label: string; scopes: string[]; scopeMask?: number; expiresAt?: string } = {
                label: opts.label,
                scopes
            };
            if (opts.scopeMask) {
                body.scopeMask = Number(opts.scopeMask);
            }
            if (opts.expires) {
                body.expiresAt = opts.expires;
            }
            const created = await client.createToken(bearer, body);
            logger.success(`Created PAT '${created.label}'`);
            logger.info('');
            logger.warn('Copy this token now — it will not be shown again:');
            logger.info(kleur.bold().green(created.token));
        });

    token
        .command('revoke')
        .description('Revoke a PAT by id')
        .argument('<id>', 'PAT id')
        .action(async (id: string) => {
            const bearer = await requireBearer();
            const client = new ConsoleClient();
            await client.revokeToken(bearer, id);
            logger.success(`Revoked ${id}`);
        });
};
