export function createElementFromHTML<T extends HTMLElement = HTMLElement>(
    html
): T {
    const div = document.createElement("div");
    div.innerHTML = html.trim();

    return div.firstChild as T;
}

export function clickSyntheticLink(url: string) {
    createElementFromHTML(`<a href="${url}"></a>`).click();
}

export function readTextFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();

        fileReader.onload = () => resolve(fileReader.result as string);
        fileReader.onerror = () =>
            reject(new Error("Failed to read text file"));

        fileReader.readAsText(file);
    });
}

export function clickFileInput(fileInput: HTMLInputElement) {
    fileInput.value = "";
    fileInput.click();
}

export function delay(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => resolve(), ms);
    });
}

export async function tryGetResponseText(response: Response) {
    try {
        return await response.text();
    } catch (err) {
        return `<error getting reponse text: ${err.message}`;
    }
}

export function humanFileSize(bytes: number, dp = 1) {
    const thresh = 1000;

    if (Math.abs(bytes) < thresh) {
        return `${bytes} B`;
    }

    const units = [ "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB" ];
    let u = -1;
    const r = 10 ** dp;

    do {
        bytes /= thresh;
        ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);

    return `${bytes.toFixed(dp)} ${units[u]}`;
}
