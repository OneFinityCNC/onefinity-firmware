interface RegisterableControllerMethods {
    stop: () => void;
    send: (gcode: string) => void;
    dispatch: (event: string, ...args: any[]) => void;
    isAxisHomed: (axis: string) => boolean;
    unhome: (axis: string) => void;
    set_position: (axis: string, value: number) => void;
    set_home: (axis: string, value: number) => void;
}

interface ControllerMethods extends RegisterableControllerMethods {
    gotoZero: (axes: "xy" | "z") => void;
}

export let ControllerMethods: ControllerMethods;

ControllerMethods = {
    ...ControllerMethods,
    dispatch: () => undefined,
};

export function registerControllerMethods(methods: Partial<RegisterableControllerMethods>) {
    ControllerMethods = {
        ...ControllerMethods,
        ...methods,
        gotoZero
    };
}

function gotoZero(axes: "xy" | "z") {
    let axesClause = "";
    switch (axes.toLowerCase()) {
        case "xy":
            axesClause = "X0Y0";
            break;

        case "z":
            axesClause = "Z0";
            break;

        default:
            throw new Error(`Invalid axes: ${axes}`);
    }

    ControllerMethods.send(`
        G90
        G0 ${axesClause}
    `);
}