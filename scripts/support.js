#!/usr/bin/env node

const inquirer = require("inquirer");
const { SSM } = require("@aws-sdk/client-ssm");
const { initSignalHandlers } = require("./util");
const fetch = require("node-fetch");

let ssm;

const Commands = [
    "code",
    "ssh",
    "web",
    "disconnect"
];

initSignalHandlers();
main();

async function main() {
    await getAWSCredentials();

    const { command } = await inquirer.prompt({
        type: "list",
        name: "command",
        choices: Commands
    });

    switch (command) {
        case "code":
            return await commandCode();

        case "ssh":
            return await commandSsh();

        case "web":
            return await commandWeb();

        case "disconnect":
            return await commandDisconnect();
    }
}

async function commandCode() {
    await closeTunnels();
    await updateNgrokAuthToken();

    const code = `000000${Math.random() * 999999}`.slice(-6);
    await saveParam("code", code);

    console.log(`The code is: ${code}`);
}

async function commandSsh() {
    const tunnels = await loadTunnels();

    if (!tunnels.length) {
        console.log("There are no tunnels!");
        return;
    }

    const sshTunnel = tunnels.find(tunnel => tunnel.proto === "tcp");
    const [ , host, port ] = sshTunnel.public_url.match(/tcp:\/\/([^:]+):(\d+)/);

    console.log("Run this:");
    console.log();
    console.log(`ssh bbmc@${host} -p ${port}`);
    console.log();
}

async function commandWeb() {
    const url = await getWebUrl();

    console.log(`Web interface: ${url}`);
    console.log();
}

async function commandDisconnect() {
    const tunnels = await loadTunnels();

    if (!tunnels.length) {
        console.log("There are no tunnels!");
        process.exit(1);
    }

    const webTunnel = tunnels.find(tunnel => tunnel.proto === "https");

    const response = await fetch(`${webTunnel.public_url}/api/remote-diagnostics?command=disconnect`, {
        headers: {
            Authorization: `Basic ${Buffer.from("onefinity:onefinity").toString("base64")}`
        }
    });

    console.log();
    console.log(await response.text());
    console.log();
    console.log("We now need a new ngrok auth token.");

    await promptForNewAuthToken();
}

async function updateNgrokAuthToken() {
    const storedAuthToken = await loadParam("ngrok-auth-token", "");

    const apiKey = await loadParam("ngrok-api-key");
    const response = await fetch("https://api.ngrok.com/credentials", {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Ngrok-Version": "2"
        }
    });

    const result = await response.json();
    let authToken = result.credentials[0].token;

    if (authToken === storedAuthToken) {
        console.warn("The nGrok AuthToken is stale.");

        const { ignore } = await inquirer.prompt({
            type: "confirm",
            name: "ignore"
        });

        if (!ignore) {
            authToken = await promptForNewAuthToken();
        }
    }

    await saveParam("ngrok-auth-token", authToken);
}

async function promptForNewAuthToken() {
    console.warn("To re-issue, visit: https://dashboard.ngrok.com/get-started/your-authtoken");
    const { newAuthToken } = await inquirer.prompt({
        type: "input",
        name: "newAuthToken"
    });

    return newAuthToken;
}

function getParamName(name) {
    return `/onefinity-support/${name}`;
}

async function loadParam(name, defaultValue = undefined) {
    name = getParamName(name);

    try {
        const response = await ssm.getParameter({ Name: name });
        return response.Parameter.Value;
    } catch (error) {
        if (error.name !== "ParameterNotFound") {
            console.log(`Error getting parameter "${name}"`, JSON.stringify({
                name: error.name,
                message: error.message,
                stack: error.stack,
                cause: error.cause
            }, null, 4));
        }

        if (defaultValue === undefined) {
            throw error;
        }

        return defaultValue;
    }
}

async function saveParam(name, value) {
    await ssm.putParameter({
        Name: getParamName(name),
        Value: value,
        DataType: "text",
        Overwrite: true,
        Tier: "Standard",
        Type: "String"
    });
}

async function getAWSCredentials() {
    const { accessKeyId, secretAccessKey } = await inquirer.prompt([
        {
            type: "input",
            name: "accessKeyId"
        },
        {
            type: "input",
            name: "secretAccessKey"
        }
    ]);

    ssm = new SSM({
        credentials: {
            accessKeyId,
            secretAccessKey
        },
        region: "us-east-1"
    });
}

async function loadTunnels() {
    const apiKey = await loadParam("ngrok-api-key");
    const response = await fetch("https://api.ngrok.com/tunnels", {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Ngrok-Version": 2
        }
    });

    const { tunnels } = await response.json();

    return tunnels;
}

async function getWebUrl() {
    const tunnels = await loadTunnels();

    if (!tunnels.length) {
        console.log("There are no tunnels!");
        process.exit(1);
    }

    const webTunnel = tunnels.find(tunnel => tunnel.proto === "https");
    const url = new URL(webTunnel.public_url);
    url.username = "onefinity";
    url.password = "onefinity";
    url.protocol = "http";

    return url.toString();
}

async function closeTunnels() {
    const tunnels = await loadTunnels();

    if (!tunnels?.length) {
        return;
    }

    console.error("There are tunnels open:", JSON.stringify(tunnels, null, 4));
    console.error("Giving up");
    process.exit(1);
}
