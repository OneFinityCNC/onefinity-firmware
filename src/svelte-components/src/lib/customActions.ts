export function virtualKeyboardChangeHelper(node: HTMLElement, cb: (value: any) => void) {
    const input = node.querySelector("input");
    input.addEventListener("keyup", () => cb(input.value));
}
