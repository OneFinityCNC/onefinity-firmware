<script lang="ts">
    import WifiConnectionDialog from "$dialogs/WifiConnectionDialog.svelte";
    import ChangeHostnameDialog from "$dialogs/ChangeHostnameDialog.svelte";
    import Button, { Label } from "@smui/button";
    import List, { Item, Graphic, Text, Meta } from "@smui/list";
    import Card from "@smui/card";
    import { networkInfo, type WifiNetwork } from "$lib/NetworkInfo";
    import {GET} from "$lib/api"
    import {processNetworkInfo} from "$lib/NetworkInfo"
        
    let networkData  = GET("network")
        networkData.then(value=>processNetworkInfo(value))

    let changeHostnameDialog = {
        open: false,
    };

    let wifiConnectionDialog = {
        open: false,
        network: {} as WifiNetwork,
    };

    function refreshWifi(){
             let networkData  = GET("network")
        networkData.then(value=>processNetworkInfo(value))
    }

    function getWifiStrengthStyle(network: WifiNetwork) {
        const strength = Math.ceil((Number(network.Quality) / 100) * 4);

        switch (strength) {
            case 0:
                return "clip-path: circle(0px at 12.5px 19px);";

            case 1:
                return "clip-path: circle(4px at 12.5px 19px);";

            case 2:
                return "clip-path: circle(8px at 12.5px 19px);";

            case 3:
                return "clip-path: circle(14px at 12.5px 19px);";

            case 4:
                return "";
        }
    }

    function onChangeHostname() {
        changeHostnameDialog = {
            open: true,
        };
    }

    function onNetworkSelected(network: WifiNetwork) {
        wifiConnectionDialog = {
            open: true,
            network,
        };
    }
</script>

<WifiConnectionDialog {...wifiConnectionDialog} />
<ChangeHostnameDialog {...changeHostnameDialog} />

<div class="admin-network-view">
    <div style="display:flex; flex-direction:row; justify-content:space-between" >
            <h1>Network Info</h1>
             <div style="text-align: center; padding:20px">
            <Button on:click={refreshWifi} touch variant="raised">
                <Label>Refresh WiFi</Label>
            </Button>
            </div>
    </div>

    <div class="pure-form pure-form-aligned">
        <div class="pure-control-group">
            <label for="hostname">Hostname</label>
            <Card id="hostname" variant="outlined">
                <Text id="hostname">
                    {$networkInfo.hostname}
                </Text>
            </Card>
            <Button on:click={onChangeHostname} touch variant="raised">
                <Label>Change</Label>
            </Button>
        </div>
    </div>

    <div class="pure-form pure-form-aligned">
        <div class="pure-control-group">
            <label for="ip-addresses">IP Addresses</label>
            <Card id="ip-addresses" variant="outlined">
                <!-- {#each $networkInfo.ipAddresses as ipAddress} -->
                    <div>
                        <Text id="hostname">
                            {$networkInfo.ipAddresses}
                        </Text>
                    </div>
                <!-- {/each} -->
            </Card>
        </div>
    </div>

    <div class="pure-form pure-form-aligned">
        <div class="pure-control-group">
            <label for="wifi">Wi-Fi</label>
            <div class="wifi-networks">
                <Card id="wifi" variant="outlined">
                    <List>
                        {#if $networkInfo.wifi.networks.length === 0}
                            <Item class="wifi-network">
                                <Text>Scanning...</Text>
                            </Item>
                        {:else}
                            {#each $networkInfo.wifi.networks as network}
                                <Item
                                    class="wifi-network"
                                    on:SMUI:action={() =>
                                        onNetworkSelected(network)}
                                >
                                    <Graphic
                                        class="strength {$networkInfo.wifi
                                            .ssid === network.Name
                                            ? 'active'
                                            : ''}"
                                    >
                                        <span class="fa fa-wifi background" />
                                        <span
                                            class="fa fa-wifi"
                                            style={getWifiStrengthStyle(
                                                network
                                            )}
                                        />
                                    </Graphic>
                                    <Text style="margin-right: 20px;"
                                        >{network.Name}</Text
                                    >
                                    {#if network.Encryption !== "Open"}
                                        <Meta>
                                            <span class="fa fa-lock" />
                                        </Meta>
                                    {/if}
                                </Item>
                            {/each}
                        {/if}
                    </List>
                </Card>
                <em style="display: block;">
                    Click on a Wi-Fi network to connect or disconnect.
                </em>
            </div>
        </div>
    </div>
</div>

<style lang="scss">
    $primary: #0078e7;
    $very-dark: #555;
    $text: #777;
    $grey: #bbb;
    $light: #ddd;

    :global {
        .admin-network-view {
            .pure-form-aligned .pure-control-group label {
                vertical-align: top;
                font-size: 15pt;
                font-weight: bold;
            }

            button {
                margin: 0;
            }

            .mdc-card {
                width: 400px;
                min-height: 38px;
                display: inline-block;
                vertical-align: top;
                margin-bottom: 20px;
                margin-right: 20px;
                padding: 5px 15px;
            }

            .wifi-networks {
                display: inline-block;

                .mdc-card {
                    padding: 0;
                    margin-bottom: 5px;
                }
            }

            .wifi-network {
                .lock {
                    font-size: 20px;
                    vertical-align: text-bottom;
                }

                .strength {
                    border-radius: 50%;
                    padding: 3px;
                    background-color: $light;
                    color: $very-dark;
                    margin-right: 10px;
                    position: relative;

                    &.active {
                        background-color: $primary;
                        color: white;
                    }

                    span {
                        position: absolute;
                        top: 5px;
                        font-size: 22px;

                        &.background {
                            opacity: 0.25;
                        }
                    }
                }
            }
        }
    }
</style>