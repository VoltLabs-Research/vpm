# @voltlabs/vpm

The VoltCloud plugin registry CLI — the `npm`-equivalent for VoltSDK / Volt plugins.

> Phase 1: read-only commands + auth. Publishing, yanking, and deprecation land in Phase 2 (where this CLI will also ship as a single binary via `pkg` / Bun).

## Install

```sh
npm i -g @voltlabs/vpm
```

Once Phase 2 ships, native binaries will be available for Linux, macOS, and Windows — no Node required.

## Build from source

```sh
npm install
npm run build
chmod +x bin/vpm.js
./bin/vpm.js --help
```

## Environment

| Variable          | Default                            | Purpose                                                  |
| ----------------- | ---------------------------------- | -------------------------------------------------------- |
| `VPM_REGISTRY`    | `https://registry.voltcloud.dev`   | Registry base URL                                        |
| `VPM_CONSOLE`     | `https://console.voltcloud.dev`    | Console / identity base URL                              |
| `VOLT_CACHE_DIR`  | `~/.cache/volt`                    | Shared cache root (also used by VoltSDK 3.0)             |
| `VPM_NO_KEYRING`  | unset                              | Set to `1` to bypass the OS keychain (file fallback)     |
| `VPM_DEBUG`       | unset                              | Set to `1` to dump stack traces on uncaught errors       |

## Commands

```text
vpm login                       Device-code login against the VoltCloud console
vpm logout                      Clear credentials, revoke refresh token
vpm whoami                      Show the active account
vpm init --kind=... --name=...  Scaffold a vpm.json in CWD
vpm search <q> [--kind]         Search the registry
vpm info <pkg>[@version]        Show packument or version metadata
vpm install <pkg>[@v|range|tag] Download + extract a plugin into the Volt cache
vpm uninstall <pkg>[@version]   Remove a plugin from the cache
vpm list                        List installed plugins
vpm pack [dir]                  Create a tarball (npm pack equivalent)
vpm publish                     [Phase 2] Publish to the registry
vpm token create|list|revoke    Manage personal access tokens (PATs)
```

Run `vpm <command> --help` for command-specific flags.

## Cache layout

The CLI shares an on-disk cache with VoltSDK 3.0, so a plugin installed via `vpm install` is immediately resolvable from Python:

```
~/.cache/volt/plugins/<publisher>/<key>/<version>/<platform>/
~/.cache/volt/downloads/
~/.cache/volt/manifests/<scope>/<name>.json
~/.cache/volt/config.json
```

## Key resolution

Both forms are accepted everywhere:

```
@voltlabs/opendxa
voltlabs@opendxa   # legacy VoltSDK form
```
