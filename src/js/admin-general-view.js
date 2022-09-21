module.exports = {
    template: "#admin-general-view-template",

    attached: function() {
        this.svelteComponent = SvelteComponents.createComponent(
            "AdminGeneralView",
            document.getElementById("admin-general")
        );
    },

    detached: function() {
        this.svelteComponent.$destroy();
    }
};
