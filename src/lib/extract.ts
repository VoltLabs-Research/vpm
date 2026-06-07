import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable, pipeline } from 'node:stream';
import { promisify } from 'node:util';
import * as tar from 'tar';
import { logger } from './logger.js';

const pipelineAsync = promisify(pipeline);

const decompressZstd = async (input: Buffer): Promise<Buffer> => {
    const mod = (await import('@mongodb-js/zstd')) as unknown as {
        decompress: (data: Buffer) => Promise<Buffer>;
    };
    return mod.decompress(input);
};

const extractTarGzip = async (archive: string, target: string): Promise<void> => {
    fs.mkdirSync(target, { recursive: true });
    await pipelineAsync(fs.createReadStream(archive), tar.x({ cwd: target, gzip: true }));
};

const extractTarZst = async (archive: string, target: string): Promise<void> => {
    fs.mkdirSync(target, { recursive: true });
    const compressed = fs.readFileSync(archive);
    const decompressed = await decompressZstd(compressed);
    await pipelineAsync(Readable.from(decompressed), tar.x({ cwd: target }));
};

const extractZip = async (archive: string, target: string): Promise<void> => {
    fs.mkdirSync(target, { recursive: true });
    try {
        const mod = (await import('node:zlib')) as unknown as Record<string, unknown>;
        void mod;
    } catch {
        // node:zlib always available; this guard is for type narrowing only
    }
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync('unzip', ['-q', '-o', archive, '-d', target]);
    if (result.error || result.status !== 0) {
        throw new Error(`Failed to extract zip archive ${archive}: ${result.error?.message ?? 'unzip exited non-zero'}`);
    }
};

export const extractArchive = async (archive: string, target: string): Promise<void> => {
    const lower = archive.toLowerCase();
    logger.debug(`extracting ${archive} -> ${target}`);
    if (lower.endsWith('.tar.zst')) {
        await extractTarZst(archive, target);
        return;
    }
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
        await extractTarGzip(archive, target);
        return;
    }
    if (lower.endsWith('.zip')) {
        await extractZip(archive, target);
        return;
    }
    throw new Error(`Unsupported archive format: ${path.basename(archive)}`);
};

export const ensureExecutable = (binDir: string): void => {
    if (!fs.existsSync(binDir) || !fs.statSync(binDir).isDirectory()) {
        return;
    }
    for (const entry of fs.readdirSync(binDir)) {
        const full = path.join(binDir, entry);
        const stat = fs.statSync(full);
        if (stat.isFile()) {
            fs.chmodSync(full, stat.mode | 0o111);
        }
    }
};
