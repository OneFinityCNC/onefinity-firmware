import semverLt from "semver/functions/lt";
import dayjs from "dayjs";
import { Config } from "$lib/ConfigStore";
import { showDialog } from "$dialogs/DialogHost.svelte";
import { ControllerMethods } from "./RegisterControllerMethods";
import { tryGetResponseText } from "./util";
import uuid from "uuid";

let autoCheckEnabled = false;
let currentVersion = "";
let lastCheckTimestamp = dayjs.unix(0);
let latestVersion = "";

type Options = {
    force?: boolean
}

Config.subscribe(config => {
    autoCheckEnabled = config.admin?.["auto-check-upgrade"];
    currentVersion = config.full_version;
});

function shouldAutoCheck() {
    return autoCheckEnabled && dayjs().isAfter(lastCheckTimestamp.add(1, "hour"));
}

export async function checkFirmwareUpgrades(options: Options = {}) {
    const shouldCheck = options.force || shouldAutoCheck();
    if (!shouldCheck) {
        return true;
    }

    lastCheckTimestamp = dayjs();

    try {
        const response = await fetch(`https://raw.githubusercontent.com/OneFinityCNC/onefinity-release/master/latest.txt?cache-bust=${uuid.v4()}`);

        if (response.ok) {
            latestVersion = (await response.text()).trim();
            console.log(`Latest firmware version: v${latestVersion}`);

            if (isNewFirmwareAvailable()) {
                console.log(`New firmware is available: v${getLatestFirmwareVersion()}`);
                ControllerMethods.dispatch("new-firmware-available");
            }

            return true;
        }

        console.error("HTTP error while fetching latest version info", {
            statusCode: response.status,
            body: await tryGetResponseText(response)
        });

    } catch (err) {
        console.error("Error while fetching latest version info", err);
    }

    latestVersion = "";
    return false;
}

export function isNewFirmwareAvailable() {
    return currentVersion && latestVersion && semverLt(currentVersion, latestVersion);
}

export function getLatestFirmwareVersion() {
    return latestVersion;
}

export function updateToLatest() {
    showDialog("FirmwareUpdate", {
        action: "updateToLatest"
    });
}

export function updateToFile(firmware: File) {
    showDialog("FirmwareUpdate", {
        action: "updateToFile",
        file: firmware
    });
}
