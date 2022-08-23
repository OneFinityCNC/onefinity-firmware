module.exports = {
  template: "#admin-network-view-template",

  attached: function () {
    this.svelteComponent = SvelteComponents.createComponent(
      "AdminNetworkView",
      document.getElementById("svelte-root")
    );
  },

  detached: function() {
    this.svelteComponent.$destroy();
  }
};
