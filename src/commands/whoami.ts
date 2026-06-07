import type { Command } from 'commander';
import kleur from 'kleur';
import { ConsoleClient } from '../lib/console-client.js';
import { currentBearerToken } from '../lib/credentials.js';
import { logger } from '../lib/logger.js';

export const register = (program: Command): void => {
    program
        .command('whoami')
        .description('Show the currently authenticated account')
        .action(async () => {
            const bearer = await currentBearerToken();
            if (!bearer) {
                logger.error('Not logged in. Run `vpm login` first.');
                process.exitCode = 1;
                return;
            }
            const client = new ConsoleClient();
            const me = await client.whoami(bearer);
            logger.info(`${kleur.bold('Account ID:')} ${me.accountId}`);
            logger.info(`${kleur.bold('Email:')}      ${me.email}`);
            logger.info(`${kleur.bold('Username:')}   ${me.username}`);
        });
};
