#!/usr/bin/env node

const merge = require("lodash.merge");
const { basename, resolve } = require("path");
const { parseArgs } = require("node:util");
const { statSync, rmdirSync, copyFileSync, writeFileSync, readFileSync } = require("fs");
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
    ".config",
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
            configureAutoExpand(target, meta);
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

        const [ bootPartition, rootPartition ] = partedOutput
            .split("\n")
            .slice(-2)
            .map(line => line
                .trim()
                .split(/\s+/)
                .map(col => parseInt(col) || col)
            )
            .map(columns => ({
                number: columns[0],
                start: columns[1],
                end: columns[2],
                size: columns[3],
                type: columns[4],
                filesystem: columns[5],
                flags: columns[6]
            }));

        return {
            initialImageSize,
            bootPartition,
            rootPartition
        };
    });
}

function checkAndRepair(loopback) {
    return doStep("Checking the filesystem...", () => {
        let success = true;

        runCommand(`e2fsck -pf "${loopback}"`, {
            stdio: "inherit",
            onError: error => {
                success = error.status < 4;
                if (error.status >= 4) {
                    info(`First e2fsck returned '${error.status}'.`);
                }
            }
        });

        if (!success) {
            info("Trying harder to fix the image");
            runCommand(`e2fsck -y "${loopback}"`, {
                stdio: "inherit",
                onError: error => {
                    success = error.status < 4;
                    if (error.status >= 4) {
                        info(`Second e2fsck returned '${error.status}'.`);
                    }
                }
            });
        }

        if (!success) {
            info("The filesystem must be pretty damaged.  Trying again with the alternate superblock.");
            runCommand(`e2fsck -yf -b 32768 "${loopback}"`, {
                stdio: "inherit",
                onError: error => {
                    if (error.status >= 4) {
                        logErrorAndExit(`The final e2fsck attempt returned '${error.status}'.  Giving up.`, error);
                    }
                }
            });
        }

        runCommand("sync");
    });
}

function prepareFilesystem(loopback) {
    const mountpoint = runCommand("mktemp -d");

    const finallyHandler = () => {
        info("Unmounting the filesystem");
        runCommand(`umount "${mountpoint}"`);
        rmdirSync(mountpoint);

        runCommand("sync");
    };
    const unregister = registerSignalHandler(finallyHandler);

    try {
        doStep("Removing unnecessary files from the filesystem...", () => {
            runCommand(`mount ${loopback} ${mountpoint}`);

            scrubFiles(mountpoint, SYSTEM_FILES);
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

            const virtualKeyboardZip = resolve(`${__dirname}/../installer/linux-packages/virtualKeyboard.zip`);
            const userPiHome = resolve(`${mountpoint}/home/pi`);
            runCommand(`unzip "${virtualKeyboardZip}" -d "${userPiHome}"`);

            runCommand(`chown -R 1000:1000 ${userPiHome}/.config`);
        });

        runCommand("sync");
    } finally {
        finallyHandler();
        unregister();
    }
}

function shrinkFilesystem(loopback) {
    return doStep(`Shrinking the root filesystem`, () => {
        // We run the shrink step multiple times, because
        // each time, resize2fs can shrink it a little more,
        // until eventually it can't.
        //
        // TODO: Switch to using pipes to both display the output and capture it
        // We can then look at the output to determine when to stop, rather than
        // using a fixed count for loop.
        // See: https://stackoverflow.com/questions/22337446/how-to-wait-for-a-child-process-to-finish-in-node-js
        for (let i = 0; i < 5; ++i) {
            runCommand(`resize2fs -p "${loopback}" -M`, {
                stdio: "inherit",
                onError: error => {
                    logErrorAndExit("Error while resizing", error);
                }
            });

            runCommand("sync");
        }
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

        runCommand("sync");
    });
}

function zerofree(loopback) {
    return doStep(`Setting empty blocks to zeros`, () => {
        info("(This will take a bit - it can look like it's hung, have patience)");
        runCommand(`zerofree -v "${loopback}"`, {
            stdio: "inherit"
        });

        runCommand("sync");
    });
}

function truncateImage(target, meta) {
    return doStep(`Shrinking the image`, () => {
        const partedOutput = runCommand(`parted -sm "${target}" unit B print free`, {
            onError: error => logErrorAndExit("parted failed while shrinking the image", error)
        });

        // The output of the parted command above will look something like this:
        //
        // BYT;
        // image.img:31914983424B:file:512:512:msdos::;
        // 1:16384B:1048575B:1032192B:free;
        // 1:1048576B:135266303B:134217728B:fat32::boot;
        // 2:135266304B:2002096639B:1866830336B:ext4::;
        // 1:2002096640B:31914983423B:29912886784B:free;
        //
        // The format is:
        // "number":"begin":"end":"size":"filesystem-type":"partition-name":"flags-set";
        //
        // We're interested in the last line only, to determine
        // the start of the free space in the image, after the partitions

        const [ , startOfFreeSpace, , , type ] = partedOutput
            .split("\n")
            .at(-1)
            .replace(/^([^;]+);.*$/, "$1")
            .split(":")
            .map(col => parseInt(col) || col);

        if (type !== "free") {
            info("There is no free space after the root partition, skipping image shrinking.");
            return;
        }

        runCommand(`truncate -s "${startOfFreeSpace}" "${target}"`);
        runCommand("sync");

        const { size: newSize } = statSync(target);
        info(`Shrunk ${target} from ${meta.initialImageSize} to ${newSize}`);
    });
}

function configureAutoExpand(target, meta) {
    const mountpoint = runCommand("mktemp -d");

    return doStep("Configuring the root partition to autoexpand on first boot...", () => {
        const loopback = runCommand(`losetup -f --show -o "${meta.bootPartition.start}" "${target}"`);

        const finallyHandler = () => {
            info("Unmounting the filesystem");

            runCommand("sync");

            runCommand(`umount "${mountpoint}"`);
            runCommand(`losetup -d ${loopback}`);
            rmdirSync(mountpoint);

            runCommand("sync");
        };
        const unregister = registerSignalHandler(finallyHandler);

        try {
            runCommand(`mount ${loopback} ${mountpoint}`);

            let cmdline = readFileSync(`${mountpoint}/cmdline.txt`, { encoding: "utf8" });
            if (cmdline.match(/init_resize/)) {
                logErrorAndExit("init_resize is already in /boot/cmdline.txt");
            }

            cmdline = `${cmdline.trim()} init=/usr/lib/raspi-config/init_resize.sh`;
            writeFileSync(`${mountpoint}/cmdline.txt`, cmdline, { encoding: "utf8" });
        } finally {
            finallyHandler();
            unregister();
        }
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

function scrubFiles(mountpoint, patterns) {
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
    scrubFiles(mountpoint, USER_FILES.map(item => {
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
        console.error("Error:", JSON.stringify({
            name: error.name,
            code: error.code,
            status: error.status,
            signal: error.signal,
            error: error.error,
            pid: error.pid,
            output: error.output,
            msg: error.msg,
            message: error.message
        }, null, 4));
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
