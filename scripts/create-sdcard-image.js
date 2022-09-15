#!/usr/bin/env node

const inquirer = require("inquirer");
const { statSync } = require("fs");
const { runCommand, initSignalHandlers, assertEffectiveRoot, logErrorAndExit } = require("./util");

const IMAGE_FILENAME = "onefinity-controller.img";

initSignalHandlers();
main();

async function main() {
    assertEffectiveRoot();

    const { uid } = statSync(".");

    const devices = runCommand("df -H -T msdos")
        .split("\n")
        .filter(line => line && !line.includes("Filesystem"))
        .map(line => {
            const [ disk ] = line.split(/\s+/);
            return {
                name: line,
                value: {
                    disk: disk,
                    device: disk.replace(/s\d$/, "")
                }
            };
        });

    if (!devices.length) {
        logErrorAndExit(`
            It doesn't look like any sd-cards are mounted.
            
            Try running "diskutil", to see what's going on.
        `);
    }

    const { disk: { disk, device } } = await inquirer.prompt({
        type: "list",
        name: "disk",
        choices: devices,
        message: `Which device is the sdcard?`
    });

    runCommand(`diskutil unmount ${disk}`);
    runCommand(`dd if=${device} of=${IMAGE_FILENAME} status=progress`, {
        stdio: "inherit"
    });
    runCommand(`chown ${uid} ${IMAGE_FILENAME}`);
}
