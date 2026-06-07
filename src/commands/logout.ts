import type { Command } from 'commander';
import { ConsoleClient } from '../lib/console-client.js';
import { clearCredentials, loadCredentials } from '../lib/credentials.js';
import { logger } from '../lib/logger.js';

export const register = (program: Command): void => {
    program
        .command('logout')
        .description('Clear stored credentials and revoke the active session')
        .option('--keep-remote', 'skip revoking the refresh token on the console')
        .action(async (opts: { keepRemote: boolean }) => {
            const creds = await loadCredentials();
            if (!creds.accessToken && !creds.refreshToken && !creds.pat) {
                logger.info('Not logged in.');
                return;
            }
            if (!opts.keepRemote && creds.refreshToken) {
                try {
                    const client = new ConsoleClient();
                    await client.logout(creds.refreshToken);
                } catch (err) {
                    logger.warn(`failed to revoke remote session: ${(err as Error).message}`);
                }
            }
            await clearCredentials();
            logger.success('Logged out.');
        });
};
