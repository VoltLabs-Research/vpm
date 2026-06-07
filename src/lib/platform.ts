import * as os from 'node:os';

export const currentPlatformTag = (): string => {
    const platform = os.platform();
    const arch = os.arch();
    const sys =
        platform === 'linux' ? 'linux' :
        platform === 'darwin' ? 'darwin' :
        platform === 'win32' ? 'windows' :
        platform;
    const machine =
        arch === 'x64' ? 'x86_64' :
        arch === 'arm64' ? 'arm64' :
        arch === 'ia32' ? 'i686' :
        arch;
    return `${sys}-${machine}`;
};

export const isWindows = (): boolean => os.platform() === 'win32';
