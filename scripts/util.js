const { execSync } = require("child_process");
const { statSync } = require("fs");
const { exit } = require("process");

module.exports = {
    info,
    runCommand,
    logErrorAndExit,
    registerSignalHandler,
    initSignalHandlers,
    assertOS,
    assertEffectiveRoot,
    assertFileExists,
    assertInstalled,
    doFinally
};

let signalHandlers = [];

function registerSignalHandler(cb) {
    signalHandlers.push(cb);

    return () => (signalHandlers = signalHandlers.filter(h => h === cb));
}

function initSignalHandlers() {
    process.on("SIGTERM", handle);
    process.on("SIGINT", handle);
    process.on("SIGHUP", handle);
}

function handle(signal) {
    console.log(`Received ${signal}`);

    for (const handler of signalHandlers) {
        handler(signal);
    }
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

async function doFinally(doHandler, finallyHandler) {
    const unregister = registerSignalHandler(finallyHandler);

    try {
        await doHandler();
    } finally {
        unregister();
        await finallyHandler();
    }
}