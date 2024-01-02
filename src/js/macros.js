"use strict";

const api = require("./api");
const utils = require("./utils");

module.exports = {
    template: "#macros-template",
    props: [ "config", "template", "state" ],

    data: function (){
        return {
            toolpath_progress: 0,
        }
    },
    components: {
        "axis-control": require("./axis-control"),
        "path-viewer": require("./path-viewer"),
        "gcode-viewer": require("./gcode-viewer")
    },
    computed:{
        mach_state: function() {
            const cycle = this.state.cycle;
            const state = this.state.xx;

            if (state != "ESTOPPED" && (cycle == "jogging" || cycle == "homing")) {
                return cycle.toUpperCase();
            }
            
            return state || "";
        },
        is_ready: function() {
            return this.mach_state == "READY";
        },
    },
    methods:{
        open: function() {
            utils.clickFileInput("gcode-file-input");
        },
        load: function() {
            const file_time = this.state.selected_time;
            console.log('file_time',file_time);
            const file = this.state.selected;
            console.log("file: ",file);
            // if (this.last_file == file && this.last_file_time == file_time) {
            //     return;
            // }

            // this.last_file = file;
            // this.last_file_time = file_time;

            // this.$broadcast("gcode-load", file);
            // this.$broadcast("gcode-line", this.state.line);
            // this.toolpath_progress = 0;
            // this.load_toolpath(file, file_time);
        },
        upload: function(e) {
            const files = e.target.files || e.dataTransfer.files;
            if (!files.length) {
                return;
            }

            const file = files[0];
            const extension = file.name.split(".").pop();
            switch (extension.toLowerCase()) {
                case "nc":
                case "ngc":
                case "gcode":
                case "gc":
                    break;

                default:
                    alert(`Unsupported file type: ${extension}`);
                    return;
            }

            SvelteComponents.showDialog("Upload", {
                file,
                onComplete: () => {
                    this.last_file_time = undefined; // Force reload
                    this.$broadcast("gcode-reload", file.name);
                }
            });
        },
        saveMacros: async function(){
            var macrosName = document.getElementById("macros-name").value;
            var macrosColor = document.getElementById("macros-color").value;
            if(this.config.macros == undefined) {
                console.log("macros is undefined");
                this.config.macros=[];
            }else{
                this.config.macros[0].name=macrosName;
                this.config.macros[0].color=macrosColor;
                this.config.macros[0].gcode=this.state.selected;
            }
            console.log(this.config.macros);
            try {
                await api.put("config/save",this.config);
                console.log("Successfully saved");
                this.$dispatch("update");
            } catch (error) {
                console.error("Restore Failed: ",error);
                alert("Restore failed");
            }
        },
        printConfig: function(){
            console.log(this.config);
        }
    }
}