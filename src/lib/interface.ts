import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';

const INTERFACE_VERSION = 2;
const DESCRIPTOR_VERSION = 1;

const OPTION_TYPES = ['bool', 'int', 'float', 'string', 'enum', 'path', 'path-list'] as const;

const DescriptorOptionSchema = z.object({
    flag: z.string().regex(/^--[A-Za-z0-9][A-Za-z0-9_-]*$/, 'flag must look like --name'),
    type: z.enum(OPTION_TYPES),
    help: z.string().optional(),
    default: z.string().optional(),
    values: z.array(z.string()).optional(),
    bundleDefault: z.string().optional()
});

const DescriptorSchema = z.object({
    descriptor: z.literal(DESCRIPTOR_VERSION),
    name: z.string(),
    description: z.string().optional(),
    frameMode: z.enum(['single', 'referencePair', 'window', 'all']).optional(),
    needsReferenceFrame: z.boolean().optional(),
    positional: z.array(z.string()).optional(),
    options: z.array(DescriptorOptionSchema)
});

const RequirementSchema = z.object({
    id: z.string().min(1),
    capability: z.string().min(1),
    bind: z.record(z.string().regex(/^--[A-Za-z0-9][A-Za-z0-9_-]*$/)).default({}),
    required: z.boolean().default(true),
    multiple: z.boolean().default(false)
});

const PluginInterfaceSchema = z.object({
    version: z.literal(INTERFACE_VERSION),
    input: z.object({ from: z.string(), port: z.string() }).nullish(),
    requires: z.array(RequirementSchema).optional(),
    provides: z.record(z.record(z.string().min(1))).optional(),
    params: z
        .object({
            descriptor: z.literal(DESCRIPTOR_VERSION),
            generated: z.boolean().optional(),
            checksum: z.string().min(1),
            options: z.array(DescriptorOptionSchema)
        })
        .optional()
});

type DescriptorOption = z.infer<typeof DescriptorOptionSchema>;
type Descriptor = z.infer<typeof DescriptorSchema>;
type PluginInterface = z.infer<typeof PluginInterfaceSchema>;

const canonicalJson = (value: unknown): string => {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'string') {
        return asciiJsonString(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
    const body = keys.map((key) => `${asciiJsonString(key)}:${canonicalJson(record[key])}`);
    return `{${body.join(',')}}`;
};

const ESCAPES: Record<string, string> = {
    '"': '\\"',
    '\\': '\\\\',
    '\b': '\\b',
    '\f': '\\f',
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t'
};

const asciiJsonString = (value: string): string => {
    let out = '"';
    for (const char of value) {
        const escape = ESCAPES[char];
        if (escape) {
            out += escape;
            continue;
        }
        const code = char.codePointAt(0)!;
        if (code < 0x20 || code > 0x7e) {
            if (code > 0xffff) {
                const adjusted = code - 0x10000;
                const high = 0xd800 + (adjusted >> 10);
                const low = 0xdc00 + (adjusted & 0x3ff);
                out += `\\u${high.toString(16).padStart(4, '0')}`;
                out += `\\u${low.toString(16).padStart(4, '0')}`;
            } else {
                out += `\\u${code.toString(16).padStart(4, '0')}`;
            }
            continue;
        }
        out += char;
    }
    return `${out}"`;
};

const paramsChecksum = (options: DescriptorOption[]): string =>
    `sha256:${crypto.createHash('sha256').update(canonicalJson(options), 'utf8').digest('hex')}`;

const resolveEntrypoint = (bundleDir: string, pluginName: string): string[] => {
    const pick = (dir: string, preferNamed: boolean): string | undefined => {
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
            return undefined;
        }
        const files = fs
            .readdirSync(dir)
            .map((entry) => path.join(dir, entry))
            .filter((entry) => fs.statSync(entry).isFile())
            .sort();
        if (files.length === 0) {
            return undefined;
        }
        if (files.length === 1) {
            return files[0];
        }
        if (preferNamed) {
            const short = pluginName.split('/').pop()!;
            for (const candidate of [short, `${short}.exe`]) {
                const match = files.find((file) => path.basename(file) === candidate);
                if (match) {
                    return match;
                }
            }
        }
        throw new Error(
            `Ambiguous entrypoint in ${dir}: ${files.map((f) => path.basename(f)).join(', ')}`
        );
    };

    const binary = pick(path.join(bundleDir, 'bin'), true);
    if (binary) {
        return [binary];
    }
    const script = pick(path.join(bundleDir, 'scripts'), false);
    if (script) {
        return script.endsWith('.py') ? [process.env.PYTHON ?? 'python3', script] : [script];
    }
    throw new Error(`No entrypoint found under ${bundleDir}/bin or ${bundleDir}/scripts`);
};

const describePlugin = (bundleDir: string, pluginName: string): Descriptor => {
    const command = resolveEntrypoint(bundleDir, pluginName);
    const args = [...command.slice(1), '--describe'];

    const latticeDir = path.join(bundleDir, 'share', 'volt', 'lattices');
    if (fs.existsSync(latticeDir)) {
        args.push('--lattice_dir', latticeDir);
    }

    const result = spawnSync(command[0], args, {
        encoding: 'utf8',
        cwd: bundleDir,
        env: {
            ...process.env,
            LD_LIBRARY_PATH: [path.join(bundleDir, 'lib'), process.env.LD_LIBRARY_PATH]
                .filter(Boolean)
                .join(path.delimiter),
            DYLD_LIBRARY_PATH: [path.join(bundleDir, 'lib'), process.env.DYLD_LIBRARY_PATH]
                .filter(Boolean)
                .join(path.delimiter)
        }
    });

    if (result.error) {
        throw new Error(`Could not run ${command.join(' ')} --describe: ${result.error.message}`);
    }
    if (result.status !== 0) {
        const detail = (result.stderr || result.stdout || '').trim();
        throw new Error(
            `${path.basename(command[0])} --describe exited ${result.status}.\n${detail}\n` +
                'Every plugin must implement --describe: it is where its parameters come from.'
        );
    }

    let payload: unknown;
    try {
        payload = JSON.parse(result.stdout);
    } catch (err) {
        throw new Error(
            `${path.basename(command[0])} --describe did not print JSON on stdout ` +
                `(${(err as Error).message}). Logs belong on stderr.`
        );
    }

    const parsed = DescriptorSchema.safeParse(payload);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('; ');
        throw new Error(`Malformed descriptor from ${path.basename(command[0])}: ${issues}`);
    }
    return parsed.data;
};

const readPluginInterface = (manifestPath: string): { manifest: any; iface: PluginInterface } => {
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`No plugin.json at ${manifestPath}`);
    }
    let manifest: any;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
        throw new Error(`Invalid JSON in ${manifestPath}: ${(err as Error).message}`);
    }
    const parsed = PluginInterfaceSchema.safeParse(manifest.interface);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('; ');
        throw new Error(
            `${manifestPath}: interface block is missing or invalid (${issues}). ` +
                `Plugins must declare interface version ${INTERFACE_VERSION}.`
        );
    }
    return { manifest, iface: parsed.data };
};

const validateWiring = (iface: PluginInterface, descriptor: Descriptor): string[] => {
    const problems: string[] = [];
    const flags = new Set(descriptor.options.map((option) => option.flag));

    const boundFlags = new Map<string, string>();
    for (const requirement of iface.requires ?? []) {
        for (const [port, flag] of Object.entries(requirement.bind)) {
            if (!flags.has(flag)) {
                problems.push(
                    `requirement ${requirement.id} binds port '${port}' to ${flag}, but the ` +
                        `binary has no such option (it has: ${[...flags].sort().join(', ')})`
                );
            }
            const previous = boundFlags.get(flag);
            if (previous) {
                problems.push(`${flag} is bound twice (${previous} and ${requirement.id}.${port})`);
            }
            boundFlags.set(flag, `${requirement.id}.${port}`);
        }
    }

    if (iface.input) {
        const requirement = (iface.requires ?? []).find((entry) => entry.id === iface.input!.from);
        if (!requirement) {
            problems.push(
                `input reads requirement '${iface.input.from}', which is not declared in requires`
            );
        } else if (Object.keys(requirement.bind).includes(iface.input.port)) {
            problems.push(
                `port '${iface.input.port}' both feeds the positional input and is bound to a flag`
            );
        }
    }

    for (const [capability, ports] of Object.entries(iface.provides ?? {})) {
        if (Object.keys(ports).length === 0) {
            problems.push(`provides['${capability}'] declares no ports`);
        }
    }

    return problems;
};

export const sealBundle = (bundleDir: string, pluginName: string): { options: number; checksum: string } => {
    const manifestPath = path.join(bundleDir, 'plugin.json');
    const { manifest, iface } = readPluginInterface(manifestPath);
    const descriptor = describePlugin(bundleDir, pluginName);

    const problems = validateWiring(iface, descriptor);
    if (problems.length > 0) {
        throw new Error(
            `${pluginName}: interface does not match the binary:\n  - ${problems.join('\n  - ')}`
        );
    }

    const checksum = paramsChecksum(descriptor.options);
    manifest.interface = {
        ...manifest.interface,
        params: {
            descriptor: DESCRIPTOR_VERSION,
            generated: true,
            checksum,
            options: descriptor.options
        }
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { options: descriptor.options.length, checksum };
};

export const verifySealed = (manifestPath: string): string[] => {
    const problems: string[] = [];
    let iface: PluginInterface;
    try {
        iface = readPluginInterface(manifestPath).iface;
    } catch (err) {
        return [(err as Error).message];
    }

    if (!iface.params) {
        return [
            'interface.params is missing: run `vpm seal <bundle-dir>` so the parameter table ' +
                'is generated from `<binary> --describe`'
        ];
    }
    if (!iface.params.generated) {
        problems.push('interface.params is not marked generated; re-seal the bundle');
    }
    const expected = paramsChecksum(iface.params.options);
    if (expected !== iface.params.checksum) {
        problems.push(
            `interface.params.checksum is ${iface.params.checksum} but its options hash to ` +
                `${expected}. The parameter table is generated from the binary; re-seal instead ` +
                'of editing it.'
        );
    }

    const flags = new Set(iface.params.options.map((option) => option.flag));
    for (const requirement of iface.requires ?? []) {
        for (const [port, flag] of Object.entries(requirement.bind)) {
            if (!flags.has(flag)) {
                problems.push(
                    `requirement ${requirement.id} binds '${port}' to ${flag}, absent from the ` +
                        'generated parameter table'
                );
            }
        }
    }
    return problems;
};
