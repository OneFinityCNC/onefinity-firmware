import { writable } from "svelte/store";

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
};

export const networkInfo = writable<NetworkInfo>(empty);

export function processNetworkInfo(rawNetworkInfo: NetworkInfo) {
    const now = Date.now();
    const networksByName: Record<string, WifiNetwork> = {};

    for (const network of rawNetworkInfo.wifi.networks) {
        if (network.Name) {
            network.lastSeen = now;
            network.active = rawNetworkInfo.wifi.ssid === network.Name;

            // There can be many entries for the same ssid, so
            // we want to take the one with the highest quality
            const currentNetwork = networksByName[network.Name] ?? { Quality: 0 };
            if (network.Quality >= currentNetwork.Quality) {
                networksByName[network.Name] = network;
            }
        }
    }

    for (const network of Object.values(networksByName)) {
        if (network.lastSeen - now > 30000) {
            delete networksByName[network.Name];
        }
    }

    networkInfo.set({
        ipAddresses: rawNetworkInfo.ipAddresses,
        hostname: rawNetworkInfo.hostname,
        wifi: {
            ssid: rawNetworkInfo.wifi.ssid,
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
}
