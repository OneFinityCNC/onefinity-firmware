#!/usr/bin/env node

const inquirer = require("inquirer");
const { statSync } = require("fs");
const { runCommand, initSignalHandlers, assertEffectiveRoot } = require("./util");

const IMAGE_FILENAME = "onefinity-controller.img";

initSignalHandlers();
main();

async function main() {
    assertEffectiveRoot();

    const { uid } = statSync(".");

    const devices = runCommand("df -T msdos")
        .split("\n")
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
    runCommand(`chown ${uid} 1f.img`);
}
