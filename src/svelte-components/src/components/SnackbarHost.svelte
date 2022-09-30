<script lang="ts" context="module">
    import type { Config, KitchenComponentDev } from "@smui/snackbar/kitchen";
    import Kitchen from "@smui/snackbar/kitchen";
    import dayjs, { type Dayjs, type ManipulateType } from "dayjs";

    let kitchen: KitchenComponentDev;

    export type SnackbarOptions = Config & {
        limit?: {
            key: string;
            notMoreThanOnceEvery: string;
        };
    };

    const snackbarTimestamps: Record<string, Dayjs> = {};

    export function showSnackbar(options: SnackbarOptions) {
        const { limit, ...config } = options;

        if (limit) {
            const now = dayjs();
            const timestamp = snackbarTimestamps[limit.key] || 0;
            const [value, unit] = limit.notMoreThanOnceEvery.split(/\s+/);
            const thresholdTimestamp = now.subtract(
                parseInt(value),
                unit as ManipulateType
            );

            if (thresholdTimestamp.isBefore(timestamp)) {
                return;
            }

            snackbarTimestamps[limit.key] = now;
        }

        kitchen.push(config);
    }
</script>

<Kitchen bind:this={kitchen} />
