import kleur from 'kleur';

let verbose = false;

export const setVerbose = (value: boolean): void => {
    verbose = value;
};

export const isVerbose = (): boolean => verbose;

export const logger = {
    info: (msg: string): void => {
        process.stdout.write(`${msg}\n`);
    },
    success: (msg: string): void => {
        process.stdout.write(`${kleur.green('✓')} ${msg}\n`);
    },
    warn: (msg: string): void => {
        process.stderr.write(`${kleur.yellow('!')} ${msg}\n`);
    },
    error: (msg: string): void => {
        process.stderr.write(`${kleur.red('✗')} ${msg}\n`);
    },
    debug: (msg: string): void => {
        if (verbose) {
            process.stderr.write(`${kleur.gray('debug')} ${msg}\n`);
        }
    }
};
