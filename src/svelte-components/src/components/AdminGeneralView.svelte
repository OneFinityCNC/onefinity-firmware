<script lang="ts">
    import * as api from "$lib/api";
    import Checkbox from "@smui/checkbox";
    import FormField from "@smui/form-field";
    import Button, { Label } from "@smui/button";
    import { Config } from "$lib/ConfigStore";
    import ResetConfigurationDialog from "$dialogs/ResetConfigurationDialog.svelte";
    import {
        checkFirmwareUpgrades,
        getLatestFirmwareVersion,
        isNewFirmwareAvailable,
        updateToLatest,
        updateToFile,
    } from "$lib/Firmware";
    import { showDialog } from "$dialogs/DialogHost.svelte";
    import ConfirmationDialog from "$dialogs/ConfirmationDialog.svelte";
    import { ControllerMethods } from "$lib/RegisterControllerMethods";
    import {
        clickFileInput,
        clickSyntheticLink,
        readTextFile,
    } from "$lib/util";

    let autoCheckUpgrade;
    let showResetConfigDialog = false;
    let showNewVersionUpgrade = false;
    let newFirmwareVersion = "";
    let firmwareFileInput: HTMLInputElement;
    let restoreConfigFileInput: HTMLInputElement;

    Config.subscribe((config) => {
        autoCheckUpgrade = config.admin["auto-check-upgrade"];
    });

    async function onUpgradeFromWeb() {
        const sucessfullyChecked = await checkFirmwareUpgrades({ force: true });

        if (!sucessfullyChecked) {
            showDialog("Message", {
                title: "Update check failed",
                message:
                    "Your controller may not be connected to the internet.",
            });

            return;
        }

        if (isNewFirmwareAvailable()) {
            newFirmwareVersion = getLatestFirmwareVersion();
            showNewVersionUpgrade = true;
        } else {
            showDialog("Message", {
                title: "Firmware",
                message: "Your controller is running the latest firmware",
            });
        }
    }

    async function onUpgradeFromFile() {
        const [firmware] = firmwareFileInput.files;
        if (!firmware) {
            return;
        }

        showDialog("Confirmation", {
            title: "Upload Firmware?",
            message: `Are you sure you want to upload ${firmware.name}`,
            confirmButtonTitle: "Upload",
            onConfirm: () => updateToFile(firmware),
        });
    }

    async function onChangeAutoCheckUpgrade() {
        $Config.admin["auto-check-upgrade"] = autoCheckUpgrade;
        ControllerMethods.dispatch("config-changed");
    }

    async function onBackupConfig() {
        clickSyntheticLink("/api/config/download");
    }

    async function onRestoreConfig() {
        const [configBackup] = restoreConfigFileInput.files;
        if (!configBackup) {
            return;
        }

        let config;

        try {
            const json = await readTextFile(configBackup);
            config = JSON.parse(json);
        } catch (error) {
            console.error("Invalid config file:", error);
            alert("Invalid config file");
            return;
        }

        try {
            await api.PUT("config/save", config);
            ControllerMethods.dispatch("update");

            showDialog("Message", {
                title: "Success",
                message: "Configuration restored",
            });
        } catch (error) {
            console.error("Restore failed:", error);
            alert("Restore failed");
        }
    }

    async function onResetConfig() {
        showResetConfigDialog = true;
    }
</script>

<ResetConfigurationDialog bind:open={showResetConfigDialog} />

<ConfirmationDialog
    bind:open={showNewVersionUpgrade}
    title="New firmware available"
    confirmButtonTitle="Upgrade"
    onConfirm={() => updateToLatest()}
>
    <p>Firmware v{newFirmwareVersion} is available.</p>

    <p>Would you like to upgrade now?</p>
</ConfirmationDialog>

<input
    bind:this={firmwareFileInput}
    type="file"
    accept=".bz2"
    style="display: none;"
    on:change={onUpgradeFromFile}
/>

<input
    bind:this={restoreConfigFileInput}
    type="file"
    accept=".json"
    style="display: none;"
    on:change={onRestoreConfig}
/>

<div class="admin-general-view">
    <h2>Firmware</h2>

    <Button on:click={onUpgradeFromWeb} touch variant="raised">
        <Label>Upgrade via Web</Label>
    </Button>

    <Button
        on:click={() => clickFileInput(firmwareFileInput)}
        touch
        variant="raised"
    >
        <Label>Upgrade via File</Label>
    </Button>

    <div style="margin-top: 10px;">
        <FormField>
            <Checkbox
                touch
                bind:checked={autoCheckUpgrade}
                on:change={onChangeAutoCheckUpgrade}
            />
            <span class="checkbox-label" slot="label"
                >Automatically check for upgrades</span
            >
        </FormField>
    </div>

    <h2>Configuration</h2>

    <Button on:click={onBackupConfig} touch variant="raised">
        <Label>Backup</Label>
    </Button>

    <Button
        on:click={() => clickFileInput(restoreConfigFileInput)}
        touch
        variant="raised"
    >
        <Label>Restore</Label>
    </Button>

    <Button on:click={onResetConfig} touch variant="raised">
        <Label>Reset</Label>
    </Button>

    <h2>Debugging</h2>

    <Button
        on:click={() => window.open("/api/log", "_blank")}
        touch
        variant="raised"
    >
        <Label>View Log</Label>
    </Button>

    <Button
        on:click={() => clickSyntheticLink("/api/bugreport")}
        touch
        variant="raised"
    >
        <Label>Bug Report</Label>
    </Button>
</div>

<style lang="scss">
    .checkbox-label {
        font-size: 110%;
        font-weight: bold;
    }
</style>
