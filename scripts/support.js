#!/usr/bin/env node

const inquirer = require("inquirer");
const { SSM } = require("@aws-sdk/client-ssm");
const { initSignalHandlers } = require("./util");
const fetch = require("node-fetch");

let ssm;

initSignalHandlers();
main();

async function main() {
    await getAWSCredentials();

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const { command } = await inquirer.prompt({
            type: "list",
            name: "command",
            choices: [
                "code",
                "info",
                "disconnect"
            ]
        });

        switch (command) {
            case "code":
                await commandCode();
                break;

            case "info":
                await commandInfo();
                break;

            case "disconnect":
                await commandDisconnect();
                break;
        }
    }
}

async function commandCode() {
    const tunnels = await loadTunnels();

    if (tunnels?.length) {
        console.log("There are active tunnels.  Disconnect first.");
        return;
    }

    await updateNgrokAuthToken();

    const code = randomIntFromInterval(100000, 999999).toString();
    await saveParam("code", code);

    console.log(`The code is: ${code}`);
}

async function commandInfo() {
    const tunnels = await loadTunnels();

    if (!tunnels.length) {
        console.log("There are no tunnels!");
        return;
    }

    const webTunnel = tunnels.find(tunnel => tunnel.proto === "https");
    const sshTunnel = tunnels.find(tunnel => tunnel.proto === "tcp");
    const [ , host, port ] = sshTunnel.public_url.match(/tcp:\/\/([^:]+):(\d+)/);

    console.log("Connection info:");
    console.log(webTunnel.public_url);
    console.log(`ssh bbmc@${host} -p ${port}`);
    console.log();
}

async function commandDisconnect() {
    const tunnels = await loadTunnels();

    if (!tunnels.length) {
        console.log("There are no tunnels!");
        return;
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

function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}