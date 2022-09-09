"use strict";

async function callApi(method, url, data) {
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
            cache: "no-cache",
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

module.exports = {
    get: function(url) {
        return callApi("GET", url);
    },

    put: function(url, body = undefined) {
        return callApi("PUT", url, body);
    },

    delete: function(url) {
        return callApi("DELETE", url);
    }
};
