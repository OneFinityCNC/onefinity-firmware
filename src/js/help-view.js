module.exports = {
    template: "#help-view-template",

    attached: function() {
        this.svelteComponent = SvelteComponents.createComponent(
            "HelpView",
            document.getElementById("help")
        );
    },

    detached: function() {
        this.svelteComponent.$destroy();
    }
};
