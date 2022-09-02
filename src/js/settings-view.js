module.exports = {
    template: "#settings-view-template",

    attached: function () {
        this.svelteComponent = SvelteComponents.createComponent(
            "SettingsView",
            document.getElementById("settings")
        );
    },

    detached: function() {
        this.svelteComponent.$destroy();
    }
};
