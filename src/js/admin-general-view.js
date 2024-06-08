"use strict";

const api = require("./api");
const utils = require("./utils");
const merge = require("lodash.merge");

const config_defaults = require("../resources/onefinity_defaults.json");

const variant_defaults = {
  machinist_x35: require("../resources/onefinity_machinist_x35_defaults.json"),
  woodworker_x35: require("../resources/onefinity_woodworker_x35_defaults.json"),
  woodworker_x50: require("../resources/onefinity_woodworker_x50_defaults.json"),
  journeyman_x50: require("../resources/onefinity_journeyman_x50_defaults.json"),
  foreman_pro: require("../resources/onefinity_foreman_pro_defaults.json"),
};

const z_slider_defaults = {
  "Z-16 Original": {
    "travel-per-rev": 4,
    "min-soft-limit": -133,
    "max-velocity": 3,
  },
  "Z-20 Heavy Duty": {
    "travel-per-rev": 10,
    "min-soft-limit": -160,
    "max-velocity": 7,
  },
};

module.exports = {
  template: "#admin-general-view-template",
  props: ["config", "state"],

  data: function () {
    return {
      confirmReset: false,
      autoCheckUpgrade: true,
      reset_variant: "",
      z_slider: false,
      z_slider_variant: " ",
      config: "",
    };
  },

  ready: function () {
    this.autoCheckUpgrade = this.config.admin["auto-check-upgrade"];
  },

  methods: {
    backup: function () {
      document.getElementById("download-target").src =
        "/api/config/download/" +
        this.state.macros
          .filter(item => item.file_name != "default")
          .map(item => item.file_name)
          .join(",");
    },

    restore_config: function () {
      utils.clickFileInput("restore-config");
    },

    restore: async function (e) {
      const files = e.target.files || e.dataTransfer.files;
      if (!files.length) {
        return;
      }

      const formData = new FormData();
      formData.append("zipfile", files[0]);

      try {
        await fetch("/api/config/restore", {
          method: "PUT",
          body: formData,
          headers: {
            Type: "zip",
          },
        });
        SvelteComponents.showDialog("Message", {
          title: "Success",
          message: "Configuration restored",
        });
        this.confirmReset = false;
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },

    next: async function () {
      const config = merge({}, config_defaults, variant_defaults[this.reset_variant]);

      try {
        await api.put("config/save", config);
        this.confirmReset = false;
        this.$dispatch("update");
        this.config = config;
        this.z_slider = true;
      } catch (error) {
        console.error("Restore failed:", error);
        alert("Restore failed");
      }
    },

    set_z_slider: async function () {
      const z_variant = merge({}, this.config.motors[3], z_slider_defaults[this.z_slider_variant]);

      this.config.motors[3] = z_variant;
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
        SvelteComponents.showDialog("Message", {
          title: "Success",
          message: "Configuration restored",
        });
        this.z_slider = false;
      } catch (error) {
        console.error("Z slider failed:", error);
        alert("failed to set Z slider  ");
      }
    },
    check: function () {
      this.$dispatch("check");
    },

    upgrade: function () {
      this.$dispatch("upgrade");
    },

    upload_firmware: function () {
      utils.clickFileInput("upload-firmware");
    },

    upload: function (e) {
      const files = e.target.files || e.dataTransfer.files;
      if (!files.length) {
        return;
      }
      this.$dispatch("upload", files[0]);
    },

    change_auto_check_upgrade: function () {
      this.config.admin["auto-check-upgrade"] = this.autoCheckUpgrade;
      this.$dispatch("config-changed");
    },
  },
};
