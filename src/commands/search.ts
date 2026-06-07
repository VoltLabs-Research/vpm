import type { Command } from 'commander';
import kleur from 'kleur';
import { RegistryClient } from '../lib/registry-client.js';
import { currentBearerToken } from '../lib/credentials.js';
import { logger } from '../lib/logger.js';

export const register = (program: Command): void => {
    program
        .command('search')
        .description('Search the VoltCloud registry for plugins')
        .argument('<query>', 'search terms')
        .option('--kind <kind>', 'filter by kind: workflow | engine | lib')
        .option('--page <n>', 'page number', '1')
        .option('--page-size <n>', 'page size', '20')
        .option('--json', 'output raw JSON')
        .action(async (query: string, opts: { kind?: string; page: string; pageSize: string; json?: boolean }) => {
            const client = new RegistryClient();
            const bearer = await currentBearerToken();
            const result = await client.search(
                query,
                {
                    kind: opts.kind,
                    page: Number(opts.page),
                    pageSize: Number(opts.pageSize)
                },
                bearer
            );
            if (opts.json) {
                logger.info(JSON.stringify(result, null, 2));
                return;
            }
            if (result.items.length === 0) {
                logger.info('No packages found.');
                return;
            }
            for (const item of result.items) {
                const version = item.latest ?? 'unreleased';
                const head = `${kleur.bold().cyan(item.fullName)}${kleur.gray('@' + version)} ${kleur.gray('[' + item.kind + ']')}`;
                logger.info(head);
                if (item.description) {
                    logger.info(`  ${item.description}`);
                }
                logger.info(
                    `  ${kleur.gray(`downloads: ${item.downloads.total} total, ${item.downloads.last30d} last 30d`)}`
                );
            }
            logger.info('');
            logger.info(kleur.gray(`Page ${result.page} • ${result.total} total result(s)`));
        });
};
