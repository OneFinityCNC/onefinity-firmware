"use strict";

async function callApi(method, url, body) {
    try {
        const response = await fetch(`/api/${url}`, {
            method,
            headers: {
                "Content-Type": "application/json"
            },
            body
        });

        if (response.ok) {
            return response.json();
        }

        throw new Error(await response.text());
    } catch (error) {
        console.debug(`API Error: ${url}: ${error}`);

        throw error;
    }
}

module.exports = {
    get: function (url) {
        return callApi("GET", url);
    },

    put: function(url, body = undefined) {
        return callApi("PUT", url, body);
    },

    delete: function (url) {
        return callApi("DELETE", url);
    }
};
