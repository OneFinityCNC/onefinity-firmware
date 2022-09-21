export default {
    getString(name, defaultValue) {
        const value = localStorage.getItem(name);

        if (value === null) {
            return defaultValue;
        }

        return value;
    },

    getBool(name, defaultValue) {
        const value = localStorage.getItem(name);

        if (value === null) {
            return defaultValue;
        }

        return value === "true";
    },

    setString(name, value) {
        localStorage.setItem(name, value);
    },

    setBool(name, value) {
        localStorage.setItem(name, value ? "true" : "false");
    },

    remove(name) {
        localStorage.removeItem(name);
    }
};
