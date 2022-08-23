type ControllerMethods = {
    stop: () => void;
    send: (gcode: string) => void;
    goto_zero: (x: number, y: number, z: number, a: number) => void;
}

export let ControllerMethods: ControllerMethods;

export function registerControllerMethods(methods: ControllerMethods) {
    ControllerMethods = methods;
}
