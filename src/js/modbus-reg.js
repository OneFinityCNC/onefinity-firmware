"use strict";

module.exports = {
  replace: true,
  template: "#modbus-reg-view-template",
  props: ["index", "model", "template", "enable"],

  computed: {
    has_user_value: function () {
      var type = this.model["reg-type"];
      return type.includes("write") || type.includes("fixed") || type.includes("scaled");
    },
  },

  methods: {
    change: function () {
      this.$dispatch("input-changed");
    },
  },
};
