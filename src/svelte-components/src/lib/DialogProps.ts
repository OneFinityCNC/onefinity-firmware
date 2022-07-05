import { writable } from "svelte/store";

type HomeMachine = {
    open: boolean,
    home: () => any
}

export type DialogPropsTypes = {
    HomeMachine: HomeMachine
}

export const HomeMachine = writable<HomeMachine>();

export default {
    HomeMachine
};
