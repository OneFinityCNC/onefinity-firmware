type ControllerMethods = {
    stop: () => void;
    send: (gcode: string) => void;
    goto_zero: (x: number, y: number, z: number, a: number) => void;
    dispatch: (event: string, ...args: any[]) => void;
}

export let ControllerMethods: ControllerMethods;

export function registerControllerMethods(methods: Partial<ControllerMethods>) {
    ControllerMethods = {
        ...ControllerMethods,
        ...methods
    };
}
