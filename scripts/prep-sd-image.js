#!/usr/bin/env node

const inquirer = require("inquirer");
const merge = require("lodash.merge");
const { resolve } = require("path");
const { statSync, rmdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } = require("fs");
const { exit } = require("process");
const { glob } = require("glob");
const packageJSON = require("../package.json");
const config_defaults = require("../src/resources/onefinity_defaults.json");
const { info, runCommand, logErrorAndExit, assertOS, assertEffectiveRoot, assertFileExists, assertInstalled, initSignalHandlers, registerSignalHandler } = require("./util");

const variant_defaults = {
    machinist_x35: require("../src/resources/onefinity_machinist_x35_defaults.json"),
    woodworker_x35: require("../src/resources/onefinity_woodworker_x35_defaults.json"),
    woodworker_x50: require("../src/resources/onefinity_woodworker_x50_defaults.json"),
    journeyman_x50: require("../src/resources/onefinity_journeyman_x50_defaults.json")
};

const ORIGINAL_IMAGE_FILENAME = "onefinity-controller.img";

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
    "/tmp/*",
    "/usr/**/__pycache__",
    "/usr/**/*.py[co]",
    "/usr/share/doc/*",
    "/var/@(cache|backups|log|tmp)/*",
    "/var/lib/apt/lists/*",
    "/var/lib/bbctrl/@(config|gamepads).json",
    "/var/lib/bbctrl/@(firmware|plans|upload)/*",
    "/var/lib/dhcpcd5/*",
    "/var/swap",
];

const USER_FILES = [
    ".bash_history",
    ".cache",
    ".config",
    ".lesshst",
    ".local",
    ".nano",
    ".pki",
    ".prep-controller-completed",
    ".ratpoison_history",
    ".viminfo",
    ".wget-hsts",
    ".Xauthority",
    "Downloads",
    "splash.png"
];

initSignalHandlers();
main();

async function main() {
    let meta;

    const finallyHandler = () => {
        if (meta) {
            if (existsSync(meta.imageFilePath)) {
                rmSync(meta.imageFilePath);
            }

            if (existsSync(meta.compressedImageFilePath)) {
                rmSync(meta.compressedImageFilePath);
            }
        }
    };
    const unregister = registerSignalHandler(finallyHandler);

    try {
        assertOS();
        assertEffectiveRoot();
        assertFileExists(ORIGINAL_IMAGE_FILENAME);
        assertInstalled(REQUIRED_TOOLS);

        const meta = prepareImage();

        await attachToLoopback(meta, "root", async (loopback) => {
            checkAndRepair(loopback);
            await prepareFilesystem(loopback);
        });

        await attachToLoopback(meta, "root", (loopback) => {
            checkAndRepair(loopback);
            shrinkFilesystem(loopback);
            shrinkPartition(loopback, meta);
            zerofree(loopback);
        });

        truncateImage(meta);
        await configureAutoExpand(meta);
        compress(meta);
        moveImageFiles(meta);
    } catch (error) {
        finallyHandler();
        unregister();

        console.error(error);
    }
}

function createImageFileCopy() {
    const target = runCommand("mktemp --tmpdir --suffix=.img onefinity-raspi-XXXXXXXXXX");

    info(`Copying ${ORIGINAL_IMAGE_FILENAME} to ${target}...`);

    runCommand(`rsync --times --progress ${ORIGINAL_IMAGE_FILENAME} ${target}`, {
        stdio: "inherit",
        onError: error => {
            logErrorAndExit(`Failed to copy ${ORIGINAL_IMAGE_FILENAME} to ${target}`, error);
        }
    });

    return target;
}

async function attachToLoopback(meta, partition, cb) {
    info("Attaching the image to a loopback device...");

    const start = meta.partitions[partition].start;
    const loopback = runCommand(`losetup -f --show -o "${start}" "${meta.imageFilePath}"`);

    const finallyHandler = () => runCommand(`losetup -d ${loopback}`);
    const unregister = registerSignalHandler(finallyHandler);

    try {
        await cb(loopback);
    } finally {
        finallyHandler();
        unregister();
    }
}

function prepareImage() {
    const imageFilePath = createImageFileCopy();

    info("Gathering info about the image...");
    const { size: initialImageSize } = statSync(imageFilePath);

    const partedOutput = runCommand(`parted -s "${imageFilePath}" unit B print`, {
        onError: error => {
            logErrorAndExit(`
                Error fetching disk image info.

                'parted' failed with exitcode ${error.status}
                
                Run 'parted ${imageFilePath} unit B print' manually to investigate
            `, error);
        }
    });

    const [ boot, root ] = partedOutput
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
        imageFilePath,
        compressedImageFilePath: getCompressedFilename(imageFilePath),
        partitions: {
            boot,
            root
        }
    };
}

function checkAndRepair(loopback) {
    info("Checking the filesystem...");

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
}

async function prepareFilesystem(loopback) {
    await mountLoopback(loopback, async mountpoint => {
        info("Removing unnecessary files from the filesystem...");

        if (!existsSync(`${mountpoint}/root/.prep-controller-completed`)) {
            const { proceed } = await inquirer.prompt({
                type: "confirm",
                name: "proceed",
                message: [
                    "It looks like 'prep-controller-for-imaging.js' has not been run on this image.",
                    "Do you want to proceed anyway?"
                ].join("\n")
            });

            if (!proceed) {
                exit(1);
            }
        }

        scrubFiles(mountpoint, SYSTEM_FILES);
        scrubUserFiles(mountpoint, "/root");
        scrubUserFiles(mountpoint, "/home/bbmc");
        scrubUserFiles(mountpoint, "/home/pi");

        info("Injecting files...");

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
}

function shrinkFilesystem(loopback) {
    info(`Shrinking the root filesystem`);

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
    }
}

function shrinkPartition(loopback, meta) {
    info(`Shrinking the root partition`);

    const tune2fsOutput = runCommand(`tune2fs -l "${loopback}"`, {
        onError: error => logErrorAndExit("tune2fs failed. Unable to shrink this type of image", error)
    });

    const root = meta.partitions.root;
    const [ , currentSize ] = tune2fsOutput.match(/^Block count:\s+(\d+)/m);
    const [ , blockSize ] = tune2fsOutput.match(/^Block size:\s+(\d+)/m);
    const newSize = parseInt(currentSize) * parseInt(blockSize);
    const newEnd = root.start + newSize;

    runCommand(`parted -s -a minimal "${meta.imageFilePath}" rm "${root.number}"`, {
        onError: error => logErrorAndExit("parted failed while deleting root partition", error)
    });

    runCommand(`parted -s "${meta.imageFilePath}" unit B mkpart "${root.type}" "${root.start}" "${newEnd}"`, {
        onError: error => logErrorAndExit("parted failed while recreating the root partition", error)
    });
}

function zerofree(loopback) {
    info(`Zeroing out empty blocks for better compression...`);
    info("(This will take a bit - it can look like it's hung, have patience)");

    runCommand(`zerofree -v "${loopback}"`, {
        stdio: "inherit"
    });
}

function truncateImage(meta) {
    info(`Shrinking the image`);

    const partedOutput = runCommand(`parted -sm "${meta.imageFilePath}" unit B print free`, {
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

    runCommand(`truncate -s "${startOfFreeSpace}" "${meta.imageFilePath}"`);

    const { size: newSize } = statSync(meta.imageFilePath);
    info(`Shrank the image from ${meta.initialImageSize} to ${newSize}`);
}

async function configureAutoExpand(meta) {
    info("Configuring the root partition to autoexpand on first boot...");

    await attachToLoopback(meta, "boot", async (loopback) => {
        await mountLoopback(loopback, mountpoint => {
            let cmdline = readFileSync(`${mountpoint}/cmdline.txt`, { encoding: "utf8" });
            if (cmdline.match(/init_resize/)) {
                logErrorAndExit("init_resize is already in /boot/cmdline.txt");
            }

            cmdline = `${cmdline.trim()} init=/usr/lib/raspi-config/init_resize.sh`;
            writeFileSync(`${mountpoint}/cmdline.txt`, cmdline, { encoding: "utf8" });
        });
    });
}

function compress(meta) {
    info(`Compressing the image`);

    runCommand(`xz -k9veT0 ${meta.imageFilePath}`, {
        stdio: "inherit"
    });

    const { size: oldSize } = statSync(meta.imageFilePath);
    const compressed = getCompressedFilename(meta.imageFilePath);

    const { size: newSize } = statSync(compressed);
    info(`Compressed the image from ${oldSize} to ${newSize}`);
}

function moveImageFiles(meta) {
    info("Finalizing...");

    const finalImageName = `onefinity-raspi-${packageJSON.version}.img`;
    const finalCompressedImageName = getCompressedFilename(finalImageName);
    runCommand(`mv ${meta.imageFilePath} ${finalImageName}`);
    runCommand(`mv ${meta.compressedImageFilePath} ${finalCompressedImageName}`);
}

function getCompressedFilename(target) {
    return `${target}.xz`;
}

async function mountLoopback(loopback, cb) {
    let mountpoint;

    const finallyHandler = () => {
        if (mountpoint) {
            runCommand(`umount "${mountpoint}"`);
            rmdirSync(mountpoint);
        }
    };
    const unregister = registerSignalHandler(finallyHandler);

    try {
        mountpoint = runCommand("mktemp --tmpdir -d onefinity-raspi-root-XXXXXXXXXX");

        runCommand(`mount ${loopback} ${mountpoint}`);
        await cb(mountpoint);
    } finally {
        finallyHandler();
        unregister();
    }
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
