import { spawn } from 'node:child_process';
import type { Command } from 'commander';
import ora from 'ora';
import kleur from 'kleur';
import { ConsoleClient } from '../lib/console-client.js';
import { saveCredentials } from '../lib/credentials.js';
import { logger } from '../lib/logger.js';

const openInBrowser = (url: string): void => {
    const platform = process.platform;
    const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    try {
        const child = spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: platform === 'win32' });
        child.unref();
    } catch (err) {
        logger.debug(`failed to open browser: ${(err as Error).message}`);
    }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const register = (program: Command): void => {
    program
        .command('login')
        .description('Authenticate with VoltCloud via device-code flow')
        .option('--no-browser', 'do not open the verification URL automatically')
        .action(async (opts: { browser: boolean }) => {
            const client = new ConsoleClient();
            const start = await client.deviceCodeStart();
            logger.info('');
            logger.info(`Open ${kleur.cyan(start.verificationUri)} in your browser`);
            logger.info(`and enter the code: ${kleur.bold().yellow(start.userCode)}`);
            logger.info('');
            if (opts.browser) {
                openInBrowser(start.verificationUri);
            }
            const spinner = ora('Waiting for confirmation…').start();
            const deadline = Date.now() + start.expiresIn * 1000;
            const intervalMs = Math.max(start.interval, 1) * 1000;
            while (Date.now() < deadline) {
                await sleep(intervalMs);
                try {
                    const result = await client.deviceCodePoll(start.deviceCode);
                    if (result === 'pending') {
                        continue;
                    }
                    spinner.succeed('Authorized');
                    const expiresAt = Date.now() + result.expiresIn * 1000;
                    await saveCredentials({
                        accessToken: result.accessToken,
                        refreshToken: result.refreshToken,
                        expiresAt
                    });
                    try {
                        const me = await client.whoami(result.accessToken);
                        await saveCredentials({
                            accessToken: result.accessToken,
                            refreshToken: result.refreshToken,
                            expiresAt,
                            accountId: me.accountId,
                            email: me.email
                        });
                        logger.success(`Logged in as ${kleur.bold(me.email)} (${me.accountId})`);
                    } catch (err) {
                        logger.warn(`Saved tokens but could not fetch profile: ${(err as Error).message}`);
                    }
                    return;
                } catch (err) {
                    spinner.fail('Authorization failed');
                    throw err;
                }
            }
            spinner.fail('Authorization timed out');
            process.exitCode = 1;
        });
};
