#!/usr/bin/env node

const merge = require("lodash.merge");
const { basename, resolve } = require("path");
const { parseArgs } = require("node:util");
const { statSync, rmdirSync, copyFileSync, writeFileSync } = require("fs");
const { execSync } = require("child_process");
const { exit } = require("process");
const { glob } = require("glob");
const packageJSON = require("../package.json");
const config_defaults = require("../src/resources/onefinity_defaults.json");

const variant_defaults = {
    machinist_x35: require("../src/resources/onefinity_machinist_x35_defaults.json"),
    woodworker_x35: require("../src/resources/onefinity_woodworker_x35_defaults.json"),
    woodworker_x50: require("../src/resources/onefinity_woodworker_x50_defaults.json"),
    journeyman_x50: require("../src/resources/onefinity_journeyman_x50_defaults.json")
};

const ARGS_CONFIG = {
    options: {
        input: {
            type: "string",
            short: "i"
        },
        help: {
            type: "boolean",
            short: "h"
        }
    }
};

const REQUIRED_TOOLS = [
    "rsync",
    "parted",
    "losetup",
    "tune2fs",
    "md5sum",
    "e2fsck",
    "resize2fs",
    "xz",
    "zerofree"
];

const SYSTEM_FILES = [
    "/var/swap",
    "/tmp/*",
    "/usr/**/__pycache__",
    "/usr/**/*.py[co]",
    "/usr/share/doc/*",
    "/var/@(cache|backups|log|tmp)/*",
    "/var/lib/apt/lists/*",
    "/var/lib/bbctrl/@(firmware|plans|upload)/*",
    "/var/lib/bbctrl/@(config|gamepads).json",
    "/var/lib/dhcpcd5/*"
];

const USER_FILES = [
    ".bash_history",
    ".nano",
    ".cache",
    ".lesshst",
    ".wget-hsts",
    ".viminfo",
    ".local",
    ".pki",
    ".ratpoison_history",
    ".Xauthority",
    {
        pattern: ".config/**",
        ignore: [
            "**/home/pi/.config",
            "**/home/pi/.config/chromium",
            "**/home/pi/.config/chromium/Default",
            "**/home/pi/.config/chromium/Default/Extensions",
            "**/home/pi/.config/chromium/Default/Extensions/*"
        ]
    },
    "Downloads",
    "splash.png"
];

let signalHandlers = [];

function registerSignalHandler(cb) {
    signalHandlers.push(cb);

    return () => (signalHandlers = signalHandlers.filter(h => h === cb));
}

function handle(signal) {
    console.log(`Received ${signal}`);

    for (const handler of signalHandlers) {
        handler(signal);
    }
}

process.on("SIGTERM", handle);
process.on("SIGINT", handle);
process.on("SIGHUP", handle);

main();

function main() {
    try {
        const { values: { input, help } } = parseArgs(ARGS_CONFIG);

        if (!input || help) {
            displayUsageAndExit();
        }

        assertOS();
        assertEffectiveRoot();
        assertFileExists(input);
        assertInstalled(REQUIRED_TOOLS);

        const target = createTargetFile(input);

        attachToLoopback(target, (loopback, meta) => {
            checkAndRepair(loopback);
            prepareFilesystem(loopback);
            shrinkFilesystem(loopback);
            shrinkPartition(target, loopback, meta);
            zerofree(loopback);
            truncateImage(target, meta);
            compress(target, meta);
        });
    } catch (error) {
        switch (error.code) {
            case "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL":
                displayUsageAndExit();
        }

        console.error(error);
    }
}

function assertOS() {
    if (process.platform !== "linux") {
        logErrorAndExit("This script requires linux.");
    }
}

function assertEffectiveRoot() {
    if (process.geteuid() !== 0) {
        logErrorAndExit("Please run this script as root");
    }
}

function assertFileExists(file) {
    const stats = statSync(file);
    if (!stats.isFile) {
        logErrorAndExit(`${file} does not exist`);
    }
}

function assertInstalled(tools) {
    const missingTools = [];

    for (const tool of tools) {
        runCommand(`command -v ${tool}`, {
            onError: () => missingTools.push(tool)
        });
    }

    if (missingTools.length) {
        logErrorAndExit(`
            This script requires some tools that are not installed.

            Install them via:
                apt-get install -y ${missingTools.join(" ")}
        `);
    }
}

function createTargetFile(file) {
    const target = `onefinity-raspi-${packageJSON.version}.img`;

    return doStep(`Copying ${file} to ${target}...`, () => {
        runCommand(`rsync --times --progress ${file} ${target}`, {
            stdio: "inherit",
            onError: error => {
                logErrorAndExit(`Failed to copy ${file} to ${target}`, error);
            }
        });

        return target;
    });
}

function attachToLoopback(file, cb) {
    const meta = gatherMetadata(file);

    return doStep("Attaching the image to a loopback device...", () => {
        const loopback = runCommand(`losetup -f --show -o "${meta.rootPartition.start}" "${file}"`);

        const finallyHandler = () => runCommand(`losetup -d ${loopback}`);
        const unregister = registerSignalHandler(finallyHandler);

        try {
            cb(loopback, meta);
        } finally {
            finallyHandler();
            unregister();
        }
    });
}

function gatherMetadata(file) {
    return doStep("Gathering info about the image...", () => {
        const { size: initialImageSize } = statSync(file);

        const partedOutput = runCommand(`parted -s "${file}" unit B print`, {
            onError: error => {
                logErrorAndExit(`
                Error fetching disk image info.

                'parted' failed with exitcode ${error.status}
                
                Run 'parted ${file} unit B print' manually to investigate
            `, error);
            }
        });

        const [ number, start, end, size, type, filesystem, flags ] = partedOutput
            .split("\n")
            .at(-1)
            .trim()
            .split(/\s+/)
            .map(col => parseInt(col) || col);

        return {
            initialImageSize,
            rootPartition: {
                number,
                start,
                end,
                size,
                type,
                filesystem,
                flags
            }
        };
    });

/*
currentsize="$(echo "$tune2fs_output" | grep '^Block count:' | tr -d ' ' | cut -d ':' -f 2)"
blocksize="$(echo "$tune2fs_output" | grep '^Block size:' | tr -d ' ' | cut -d ':' -f 2)"
partnewsize=$(($currentsize * $blocksize))
newpartend=$(($partstart + $partnewsize))

*/
}

function checkAndRepair(loopback) {
    return doStep("Checking the filesystem...", () => {
        runCommand(`e2fsck -yf ${loopback}`, {
            stdio: "inherit"
        });
    });
}

function prepareFilesystem(loopback) {
    const mountpoint = runCommand("mktemp -d");

    const finallyHandler = () => {
        info("Sleeping for 10 seconds, to allow the filesystem to flush");
        runCommand("sleep 10");

        info("Unmounting the filesystem");
        runCommand(`umount "${mountpoint}"`);
        rmdirSync(mountpoint);
    };
    const unregister = registerSignalHandler(finallyHandler);

    try {
        doStep("Removing unnecessary files from the filesystem...", () => {
            runCommand(`mount ${loopback} ${mountpoint}`);

            scrub(mountpoint, SYSTEM_FILES);
            scrubUserFiles(mountpoint, "/root");
            scrubUserFiles(mountpoint, "/home/bbmc");
            scrubUserFiles(mountpoint, "/home/pi");
        });

        doStep("Injecting files...", () => {
            copyFileSync(
                resolve(`${__dirname}/../installer/gcode/Team Onefinity.ngc`),
                resolve(`${mountpoint}/var/lib/bbctrl/upload/Team Onefinity.ngc`)
            );

            writeFileSync(`${mountpoint}/var/lib/bbctrl/config.json`,
                JSON.stringify(merge(
                    {},
                    config_defaults,
                    variant_defaults.woodworker_x35
                ), null, 4)
            );
        });
    } finally {
        finallyHandler();
        unregister();
    }
}

function shrinkFilesystem(loopback) {
    return doStep(`Shrinking the root filesystem`, () => {
        runCommand(`resize2fs -p "${loopback}" -M`, {
            stdio: "inherit",
            onError: error => {
                logErrorAndExit("Error while resizing", error);
            }
        });
    });
}

function shrinkPartition(target, loopback, meta) {
    return doStep(`Shrinking the root partition`, () => {
        const tune2fsOutput = runCommand(`tune2fs -l "${loopback}"`, {
            onError: error => logErrorAndExit("tune2fs failed. Unable to shrink this type of image", error)
        });

        const [ , currentSize ] = tune2fsOutput.match(/^Block count:\s+(\d+)/m);
        const [ , blockSize ] = tune2fsOutput.match(/^Block size:\s+(\d+)/m);
        const newSize = parseInt(currentSize) * parseInt(blockSize);
        const newEnd = meta.rootPartition.start + newSize;

        runCommand(`parted -s -a minimal "${target}" rm "${meta.rootPartition.number}"`, {
            onError: error => logErrorAndExit("parted failed while deleting root partition", error)
        });

        runCommand(`parted -s "${target}" unit B mkpart "${meta.rootPartition.type}" "${meta.rootPartition.start}" "${newEnd}"`, {
            onError: error => logErrorAndExit("parted failed while recreating the root partition", error)
        });
    });
}

function zerofree(loopback) {
    return doStep(`Setting empty blocks to zeros`, () => {
        info("(This will take a bit - it can look like it's hung, have patience)");
        runCommand(`zerofree -v "${loopback}"`, {
            stdio: "inherit"
        });
    });
}

function truncateImage(target, meta) {
    return doStep(`Shrinking the image`, () => {
        const partedOutput = runCommand(`parted -s "${target}" unit B print free`, {
            onError: error => logErrorAndExit("parted failed while shrinking the image", error)
        });

        const [ startOfFreeSpace ] = partedOutput
            .split("\n")
            .at(-1)
            .trim()
            .split(/\s+/)
            .map(col => parseInt(col) || col);

        runCommand(`truncate -s "${startOfFreeSpace}" "${target}"`);

        const { size: newSize } = statSync(target);
        info(`Shrunk ${target} from ${meta.initialImageSize} to ${newSize}`);
    });
}

function compress(target, meta) {
    return doStep(`Compressing the image`, () => {
        runCommand(`xz -k9veT0 ${target}`, {
            stdio: "inherit"
        });

        const compressed = `${target}.xz`;

        const { size: newSize } = statSync(compressed);
        info(`Shrunk ${target} from ${meta.initialImageSize} to ${newSize} (${compressed})`);
    });
}

function scrub(mountpoint, patterns) {
    for (const _pattern of patterns) {
        const { pattern, ignore } = (typeof _pattern === "string")
            ? { pattern: _pattern }
            : _pattern;

        const options = {
            dot: true,
            cwd: mountpoint,
            root: mountpoint,
            ignore
        };

        const matches = glob.sync(pattern, options);

        for (const match of matches) {
            runCommand(`rm -rvf "${match}"`, {
                stdio: "inherit"
            });
        }
    }
}

function scrubUserFiles(mountpoint, homedir) {
    scrub(mountpoint, USER_FILES.map(item => {
        if (typeof item === "string") {
            return `${homedir}/${item}`;
        }

        return {
            ...item,
            pattern: `${homedir}/${item.pattern}`,
        };
    }));
}

function doStep(msg, cb) {
    info(msg);

    return cb();
}

function info(msg) {
    console.log(`\n${msg}`);
}

function runCommand(command, _options) {
    const options = {
        encoding: "utf8",
        ..._options,
        shell: true
    };

    const { onError } = options;
    delete options["onError"];

    try {
        const result = execSync(command, options);

        return (typeof result === "string")
            ? result.trim()
            : result;
    } catch (error) {
        if (onError) {
            onError(error);
        } else {
            throw error;
        }
    }
}

function logErrorAndExit(msg, error) {
    const lines = msg.split("\n");

    // Get rid of leading blank lines
    while (lines.length) {
        if (lines[0].trim().length == 0) {
            lines.shift();
        } else {
            break;
        }
    }

    // Get rid of trailing blank lines
    while (lines.length) {
        if (lines.at(-1).trim().length == 0) {
            lines.pop();
        } else {
            break;
        }
    }

    const [ whitespace ] = lines[0].match(/^\s*/);

    console.error(lines
        .map(line => line.replace(whitespace, "").trimEnd())
        .join("\n")
    );

    if (error) {
        console.error("Error:", {
            name: error.name,
            code: error.code,
            message: error.message
        });
    }

    exit(1);
}

function displayUsageAndExit() {
    logErrorAndExit(`
        Usage: ${basename(process.argv[1])} --input <sd-card-image-file>

        This tool will:
            - Check and repair the file system, if needed
            - Remove unnecessary files from the root partition
            - Shrink the root partition as much as possible
            - Truncate the image file to be as small as possible
            - Overwrite all filesystem blank space with zeros (better compression)
            - Compress the output image

        Two output files will be produced:
            <sd-card-image-file>.shrunk.img (uncompressed)
            <sd-card-image-file>.shrunk.img.xz (compressed)
    `);

    exit(1);
}
