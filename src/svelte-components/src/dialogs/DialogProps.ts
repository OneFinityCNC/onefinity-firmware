import { writable } from "svelte/store";

export const HomeMachineProps = writable<HomeMachinePropsType>();
export type HomeMachinePropsType = {
    open: boolean,
    home: () => void
}

export const ProbeProps = writable<ProbePropsType>();
export type ProbePropsType = {
    open: boolean,
    probeType: "xyz" | "z"
};
