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
        "gcode-viewer": require("./gcode-viewer")
    },
    computed:{
        is_ready: function() {
            console.log("is_ready: ",this.mach_state);
            return this.mach_state == "READY";
        },
    },
    methods:{
        print: function(){
            var inputValue = document.getElementById('inputField').value;
            console.log(inputValue);
        },
        open: function() {
            utils.clickFileInput("gcode-file-input");
        },
        getMacrosList : function (){
            return no_of_macros;
        },
        load: function() {
            const file_time = this.state.selected_time;
            const file = this.state.selected;
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
    }
}