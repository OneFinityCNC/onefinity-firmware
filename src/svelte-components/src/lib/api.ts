type HttpMethod = "GET" | "PUT" | "POST" | "DELETE";

async function doFetch(method: HttpMethod, url: string, data: any, config: RequestInit) {
    try {
        const response = await fetch(`/api/${url}`, {
            ...config,
            method,
            cache: "no-cache",
            body: (typeof data === 'object')
                ? JSON.stringify(data)
                : undefined,
            headers: (typeof data === 'object')
                ? {
                    "Content-Type": 'application/json; charset=utf-8'
                }
                : {}
        });

        return await response.json();
    } catch (error) {
        console.debug('API Error: ' + url + ': ' + error);

        throw error;
    }
}

export async function GET(url: string, config: RequestInit = {}) {
    return doFetch('GET', url, undefined, config);
}

export async function PUT(url: string, data: any = undefined, config: RequestInit = {}) {
    return doFetch('PUT', url, data, config);
}

export async function POST(url: string, data: any = undefined, config: RequestInit = {}) {
    return doFetch('POST', url, data, config);
}

export async function DELETE(url: string, config = {}) {
    return doFetch('DELETE', url, undefined, config);
}
