<script lang="ts">
    import { refreshNetworkInfo, networkInfo } from "$lib/NetworkInfo";
    import { onMount } from "svelte";

    onMount(() => {
        refreshNetworkInfo();
    });

    $: ips = $networkInfo.ipAddresses || [];
</script>

<div class="content">
    <div>
        <b>Hostname:</b>
        {$networkInfo.hostname}.local
    </div>

    <div>
        <b>{ips.length > 1 ? `IP Addresses:` : `IP Address:`}</b>
        {ips.join(",") || "None"}
    </div>

    <div>
        <b>WiFi:</b>
        {$networkInfo.wifi.ssid || "Not connected"}
    </div>
</div>

<style lang="scss">
    .content {
        font-size: 12pt;
        margin-top: 11px;
        line-height: 1.3;
    }
</style>
