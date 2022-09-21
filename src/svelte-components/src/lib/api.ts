type HttpMethod = "GET" | "PUT" | "POST" | "DELETE";

async function doFetch(method: HttpMethod, url: string, data: any = undefined) {
    try {
        const headers = {};
        let body = undefined;

        if (data) {
            if (data instanceof FormData) {
                body = data;
            } else {
                headers["Content-Type"] = "application/json; charset=utf-8";
                body = JSON.stringify(data);
            }
        }

        const response = await fetch(`/api/${url}`, {
            method,
            headers,
            body,
            cache: "no-store",
        });

        if (response.ok) {
            return await response.json();
        }

        throw new Error(await response.text());
    } catch (error) {
        console.debug(`API Error: ${url}: ${error}`);

        throw error;
    }
}

export function GET(url: string) {
    return doFetch("GET", url);
}

export function PUT(url: string, data: any = undefined, ) {
    return doFetch("PUT", url, data);
}
