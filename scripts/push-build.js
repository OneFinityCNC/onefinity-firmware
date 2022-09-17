#!/usr/bin/env node

// This script is useful for pushing a build to the controller
// when bbctrl is not running (crashed, broken build, etc)

const inquirer = require("inquirer");
const glob = require("glob");
const { runCommand, logErrorAndExit, initSignalHandlers, assertInstalled, info } = require("./util");

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

        const { build } = await inquirer.prompt({
            type: "list",
            name: "build",
            choices: glob.sync("*.tar.bz2", {
                cwd: "./dist"
            })
        });

        runCommand(`sshpass -e /usr/bin/scp dist/${build} bbmc@${controller}:~`, {
            stdio: "inherit"
        });
        ssh(`mv /home/bbmc/${build} /var/lib/bbctrl/firmware/update.tar.bz2`);
        ssh("update-bbctrl");
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