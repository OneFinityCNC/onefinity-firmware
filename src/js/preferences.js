module.exports = {
    getString(name, defaultValue) {
        return SvelteComponents.Preferences.getString(name, defaultValue);
    },

    getBool(name, defaultValue) {
        return SvelteComponents.Preferences.getBool(name, defaultValue);
    },

    setString(name, value) {
        return SvelteComponents.Preferences.setString(name, value);
    },

    setBool(name, value) {
        return SvelteComponents.Preferences.setBool(name, value);
    },

    remove(name) {
        return SvelteComponents.Preferences.remove(name);
    }
};
