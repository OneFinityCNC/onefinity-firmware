'use strict'

module.exports = {
  template: '#settings-view-template',
  props: ['config', 'template'],

  computed: {
    display_units: {
      cache: false,
      get: function () {
        return this.$root.display_units;
      },
      set: function (value) {
        this.$root.display_units = value;
      }
    },
  },

  events: {
    'input-changed': function () {
      this.$dispatch('config-changed');
      return false;
    }
  },

  methods: {
    showScreenRotationDialog: function () {
      SvelteComponents.showDialog("ScreenRotation");
    }
  }
}
