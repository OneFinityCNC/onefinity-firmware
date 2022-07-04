import { readable } from "svelte/store";
import * as api from "./api";

export type WifiNetwork = {
    Quality: string;
    Channel: string;
    Frequency: string;
    Mode: string;
    "Bit Rates": string;
    Name: string;
    Address: string;
    Encryption: string;
    "Signal Level": string;
    "Noise Level": string;
    lastSeen: number;
    active: boolean;
};

export type NetworkInfo = {
    ipAddresses: Array<string>;
    hostname: string;
    wifi: {
        ssid: string;
        networks: Array<WifiNetwork>;
    };
};

const empty: NetworkInfo = {
    ipAddresses: [],
    hostname: "",
    wifi: {
        ssid: "",
        networks: []
    }
}

export const networkInfo = readable<NetworkInfo>(empty, (set) => {
    getNetworkInfo();
    const networkInfoIntervalId = setInterval(getNetworkInfo, 5000);

    async function getNetworkInfo() {
        const networksByName: Record<string, WifiNetwork> = {}

        try {
            const networkInfo: NetworkInfo = await api.GET("network");

            const now = Date.now();
            for (let network of networkInfo.wifi.networks) {
                if (network.Name) {
                    network.lastSeen = now;
                    network.active = networkInfo.wifi.ssid === network.Name;
                    networksByName[network.Name] = network;
                }
            }

            for (let network of Object.values(networksByName)) {
                if (network.lastSeen - now > 30000) {
                    delete networksByName[network.Name];
                }
            }

            set({
                ipAddresses: networkInfo.ipAddresses,
                hostname: networkInfo.hostname,
                wifi: {
                    ssid: networkInfo.wifi.ssid,
                    networks: Object.values(networksByName).sort((a, b) => {
                        switch (true) {
                            case a.active:
                                return -1;

                            case b.active:
                                return 1;

                            default:
                                return a.Name.localeCompare(b.Name);
                        }
                    })
                }
            });
        } catch (error) {
            console.debug("Failed to fetch network info", error);
        }
    }

    return () => {
        clearInterval(networkInfoIntervalId);
    }
})

export function init() {
    return networkInfo.subscribe(() => ({}));
}
