import type { Command } from 'commander';
import kleur from 'kleur';
import { listInstalled } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

export const register = (program: Command): void => {
    program
        .command('list')
        .alias('ls')
        .description('List plugins installed in the shared Volt cache')
        .option('--json', 'output raw JSON')
        .action(async (opts: { json?: boolean }) => {
            const records = listInstalled();
            if (opts.json) {
                logger.info(JSON.stringify(records, null, 2));
                return;
            }
            if (records.length === 0) {
                logger.info('No plugins installed.');
                return;
            }
            for (const record of records) {
                const head = `${kleur.cyan(record.publisher)}@${kleur.bold(record.key)} ${kleur.gray('@' + record.version)}`;
                logger.info(head);
                logger.info(`  ${kleur.gray('platforms:')} ${record.platforms.join(', ')}`);
            }
        });
};
