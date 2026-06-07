import type { Command } from 'commander';
import kleur from 'kleur';
import { RegistryClient } from '../lib/registry-client.js';
import { currentBearerToken } from '../lib/credentials.js';
import { resolveKey, splitVersionSpec } from '../lib/key-resolver.js';
import { logger } from '../lib/logger.js';

export const register = (program: Command): void => {
    program
        .command('info')
        .description('Show metadata for a package (optionally pinned to a version)')
        .argument('<pkg>', '@username/name or @username/name@version')
        .option('--json', 'output raw JSON')
        .action(async (pkg: string, opts: { json?: boolean }) => {
            const { ref, version } = splitVersionSpec(pkg);
            const key = resolveKey(ref);
            const client = new RegistryClient();
            const bearer = await currentBearerToken();
            if (version) {
                const vm = await client.getVersion(key.username, key.name, version, bearer);
                if (opts.json) {
                    logger.info(JSON.stringify(vm, null, 2));
                    return;
                }
                logger.info(`${kleur.bold().cyan(key.fullName)}@${kleur.bold(vm.version)}`);
                logger.info(`${kleur.gray('published:')} ${vm.publishedAt} by ${vm.publishedBy}`);
                logger.info(`${kleur.gray('size:')}      ${vm.sizeBytes} bytes`);
                logger.info(`${kleur.gray('sha256:')}    ${vm.sha256}`);
                if (vm.platforms.length > 0) {
                    logger.info(`${kleur.gray('platforms:')} ${vm.platforms.map((p) => p.tag).join(', ')}`);
                }
                if (vm.deprecated) {
                    logger.warn(`deprecated: ${vm.deprecated.reason}`);
                }
                return;
            }
            const pack = await client.getPackument(key.username, key.name, bearer);
            if (opts.json) {
                logger.info(JSON.stringify(pack, null, 2));
                return;
            }
            logger.info(kleur.bold().cyan(pack.fullName) + ` ${kleur.gray('[' + pack.kind + ']')}`);
            if (pack.description) {
                logger.info(pack.description);
            }
            if (pack.homepage) {
                logger.info(`${kleur.gray('homepage:')} ${pack.homepage}`);
            }
            logger.info(`${kleur.gray('dist-tags:')}`);
            for (const [tag, v] of Object.entries(pack.distTags)) {
                logger.info(`  ${kleur.cyan(tag)}: ${v}`);
            }
            const versions = Object.keys(pack.versions);
            logger.info(`${kleur.gray('versions:')} ${versions.length} total (latest: ${pack.distTags.latest ?? 'n/a'})`);
            logger.info(
                `${kleur.gray('downloads:')} ${pack.downloads.total} total, ${pack.downloads.last30d} last 30d`
            );
        });
};
