#!/usr/bin/env node

// This script is useful for pushing a build to the controller
// when bbctrl is not running (crashed, broken build, etc)

const inquirer = require("inquirer");
const glob = require("glob");
const {
    runCommand,
    logErrorAndExit,
    initSignalHandlers,
    assertInstalled,
    info
} = require("./util");

const hostname = "onefinity";

initSignalHandlers();
main();

async function main() {
    try {
        assertInstalled([ "sshpass", "ssh" ]);

        process.env.SSHPASS = "onefinity";

        ssh("echo sudo access confirmed", {
            onError: () => {
                logErrorAndExit([
                    "You must configure the 'bbmc` user for no-password sudo.",
                    "The secret is 'NOPASSWD:ALL'",
                    "See: https://www.cyberciti.biz/faq/linux-unix-running-sudo-command-without-a-password/"
                ].join("\n"));
            }
        });

        const build = await getBuildFilePath();

        runCommand(`sshpass -e /usr/bin/scp dist/${build} bbmc@${hostname}:~`, {
            stdio: "inherit"
        });
        ssh(`mv /home/bbmc/${build} /var/lib/bbctrl/firmware/update.tar.bz2`);
        ssh("update-bbctrl");
    } catch (error) {
        logErrorAndExit("An unexpected error occurred", error);
    }
}

async function getBuildFilePath() {
    const buildFileParam = (process.argv[2] || "").replace("dist/", "");

    const builds = glob.sync("*.tar.bz2", {
        cwd: "./dist"
    });

    if (buildFileParam) {
        if (builds.includes(buildFileParam)) {
            return buildFileParam;
        }

        logErrorAndExit(`Cannot find 'dist/${buildFileParam}'`);
    }

    switch (builds.length) {
        case 0:
            logErrorAndExit("There's no build to push!");
            break;

        case 1:
            return builds[0];

        default:
            // eslint-disable-next-line no-case-declarations
            const { build } = await inquirer.prompt({
                type: "list",
                name: "build",
                choices: builds
            });
            return build;
    }
}

function ssh(command, options) {
    info(`Running "${command}"`);

    return runCommand(`sshpass -e /usr/bin/ssh ${hostname} "sudo ${command}"`, {
        ...options,
        stdio: "inherit"
    });
}