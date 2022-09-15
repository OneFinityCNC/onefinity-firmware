module.exports = class Preferences {
    static getString(name, defaultValue) {
        const value = localStorage.getItem(name);

        if (value === null) {
            return defaultValue;
        }

        return value;
    }

    static getBool(name, defaultValue) {
        const value = localStorage.getItem(name);

        if (value === null) {
            return defaultValue;
        }

        return value === "true";
    }

    static setString(name, value) {
        localStorage.setItem(name, value);
    }

    static setBool(name, value) {
        localStorage.setItem(name, value ? "true" : "false");
    }

    static remove(name) {
        localStorage.removeItem(name);
    }
};
