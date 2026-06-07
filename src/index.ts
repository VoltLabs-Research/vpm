import { Command } from 'commander';
import kleur from 'kleur';
import { setConfigOverrides } from './lib/config.js';
import { setVerbose, logger } from './lib/logger.js';
import { HttpError } from './lib/http.js';

import * as loginCmd from './commands/login.js';
import * as logoutCmd from './commands/logout.js';
import * as whoamiCmd from './commands/whoami.js';
import * as initCmd from './commands/init.js';
import * as searchCmd from './commands/search.js';
import * as infoCmd from './commands/info.js';
import * as installCmd from './commands/install.js';
import * as uninstallCmd from './commands/uninstall.js';
import * as listCmd from './commands/list.js';
import * as packCmd from './commands/pack.js';
import * as publishCmd from './commands/publish.js';
import * as deprecateCmd from './commands/deprecate.js';
import * as tokenCmd from './commands/token.js';

const buildProgram = (): Command => {
    const program = new Command();
    program
        .name('vpm')
        .description('VoltCloud plugin registry CLI')
        .version('1.0.0', '-v, --version', 'output the current version')
        .option('--registry <url>', 'override the registry URL')
        .option('--console <url>', 'override the console URL')
        .option('--verbose', 'enable verbose logging')
        .hook('preAction', (thisCommand) => {
            const opts = thisCommand.opts<{ registry?: string; console?: string; verbose?: boolean }>();
            if (opts.verbose) {
                setVerbose(true);
            }
            if (opts.registry || opts.console) {
                setConfigOverrides({
                    registryUrl: opts.registry,
                    consoleUrl: opts.console
                });
            }
        });

    loginCmd.register(program);
    logoutCmd.register(program);
    whoamiCmd.register(program);
    initCmd.register(program);
    searchCmd.register(program);
    infoCmd.register(program);
    installCmd.register(program);
    uninstallCmd.register(program);
    listCmd.register(program);
    packCmd.register(program);
    publishCmd.register(program);
    deprecateCmd.register(program);
    tokenCmd.register(program);

    return program;
};

const main = async (): Promise<void> => {
    const program = buildProgram();
    try {
        await program.parseAsync(process.argv);
    } catch (err) {
        if (err instanceof HttpError) {
            logger.error(`${err.message} (HTTP ${err.status})`);
            process.exit(1);
        }
        if (err instanceof Error) {
            logger.error(err.message);
            if (process.env.VPM_DEBUG === '1' && err.stack) {
                process.stderr.write(kleur.gray(err.stack) + '\n');
            }
            process.exit(1);
        }
        logger.error(String(err));
        process.exit(1);
    }
};

void main();
