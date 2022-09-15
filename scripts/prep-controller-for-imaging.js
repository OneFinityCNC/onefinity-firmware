#!/usr/bin/env node

const inquirer = require("inquirer");
const { runCommand, logErrorAndExit, initSignalHandlers, assertInstalled, info } = require("./util");

const PACKAGES_TO_PURGE = [
    "aptitude",
    "dphys-swapfile",
    "gdb",
    "geoip-database",
    "gnome-icon-theme",
    "hostapd",
    "libfreetype6-dev",
    "libglib2.0-data",
    "libraspberrypi-doc",
    "mlocate",
    "sqlite3",
    "triggerhappy",
    "zip",
];

let controller;

initSignalHandlers();
main();

async function main() {
    try {
        controller = process.argv[2] ?? "onefinity";

        assertInstalled([ "sshpass", "ssh" ]);

        const { password } = await inquirer.prompt({
            type: "password",
            name: "password",
            message: `What is the password for ${controller}?`
        });

        process.env.SSHPASS = password;

        ssh("echo sudo access confirmed", {
            onError: () => {
                logErrorAndExit([
                    "You must configure the 'bbmc` user for no-password sudo.",
                    "The secret is 'NOPASSWD:ALL'",
                    "See: https://www.cyberciti.biz/faq/linux-unix-running-sudo-command-without-a-password/"
                ].join("\n"));
            }
        });

        ssh("apt-get update");
        ssh("apt-get install usbutils");
        ssh(`apt-get purge -y ${PACKAGES_TO_PURGE.join(" ")}`);
        ssh("apt-get autoremove -y");
        ssh("touch /root/.prep-controller-completed");
        ssh("sed -i -E 's|NOPASSWD:ALL|ALL|' /etc/sudoers");
    } catch (error) {
        logErrorAndExit("An unexpected error occurred", error);
    }
}

function ssh(command, options) {
    info(`Running "${command}"`);

    return runCommand(`sshpass -e /usr/bin/ssh ${controller} "sudo ${command}"`, {
        ...options,
        stdio: "inherit"
    });
}