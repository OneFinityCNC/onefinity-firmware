"use strict";

const utils = require("./utils");

module.exports = {
    template: "#macros-template",
    props: [ "config", "template", "state" ],

    data: function (){
        return {
            no_of_macros : 0,
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
            console.log("is_ready: ",this.mach_state);
            return this.mach_state == "READY";
        },
    },
    methods:{
        open: function() {
            utils.clickFileInput("gcode-file-input");
            console.log("utils done");
        },
        getMacrosList : function (){
            return no_of_macros;
        },
        load: function() {
            const file_time = this.state.selected_time;
            console.log('file_time',this.state.selected_time);
            const file = this.state.selected;
            console.log("file: ",this.state.selected);
            if (this.last_file == file && this.last_file_time == file_time) {
                return;
            }

            this.last_file = file;
            this.last_file_time = file_time;

            this.$broadcast("gcode-load", file);
            this.$broadcast("gcode-line", this.state.line);
            this.toolpath_progress = 0;
            this.load_toolpath(file, file_time);
        },
        saveMacros: function(){
            var macrosName = document.getElementById("macros-name").value;
            var macrosColor = document.getElementById("macros-color").value;
            if(this.config.macros == undefined) return;
            this.config.macros.push({
                id:Math.random(),
                name:macrosName,
                color:macrosColor
            })
        },
    }
}