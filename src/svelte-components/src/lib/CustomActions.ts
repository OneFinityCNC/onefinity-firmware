export function virtualKeyboardChange(node: HTMLElement, cb: (value: any) => void) {
    const input = node.querySelector("input");
    if (!input) {
        console.error("Could not find the textfield's <input>:", node);
        throw new Error("Could not find the textfield's <input>");
    }

    input.addEventListener("keyup", () => cb(input.value));
}
