type ControllerMethods = {
    stop: () => void;
    send: (gcode: string) => void;
    goto_zero: (x: number, y: number, z: number, a: number) => void;
    dispatch: (event: string, ...args: any[]) => void;
    isAxisHomed: (axis: string) => boolean;
    unhome: (axis: string) => void;
    set_position: (axis: string, value: number) => void;
    set_home: (axis: string, value: number) => void;
}

export let ControllerMethods: ControllerMethods;

export function registerControllerMethods(methods: Partial<ControllerMethods>) {
    ControllerMethods = {
        ...ControllerMethods,
        ...methods
    };
}
