"use strict";

const entityMap = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    "/": "&#x2F;", "`": "&#x60;", "=": "&#x3D;" };

function escapeHTML(s) {
    return s.replace(/[&<>"'`=\\/]/g, function(c) {
        return entityMap[c];
    });
}

module.exports = {
    template: "#gcode-viewer-template",

    data: function() {
        return {
            empty: true,
            file: "",
            line: -1
        };
    },

    events: {
        "gcode-load": function(file) {
            this.load(file);
        },
        "gcode-clear": function() {
            this.clear();
        },
        "gcode-reload": function(file) {
            this.reload(file);
        },
        "gcode-line": function(line) {
            this.update_line(line);
        }
    },

    ready: function() {
        this.clusterize = new Clusterize({
            rows: [],
            scrollElem: this.$el.querySelector(".clusterize-scroll"),
            contentElem: this.$el.querySelector(".clusterize-content"),
            no_data_text: "GCode view...",
            callbacks: { clusterChanged: this.highlight }
        });
    },

    attached: function() {
        if (typeof this.clusterize != "undefined") {
            this.clusterize.refresh(true);
        }
    },

    methods: {
        load: async function(file) {
            if (file == this.file) {
                return;
            }

            this.clear();
            this.file = file;
<<<<<<< HEAD

=======
>>>>>>> 427343bdd5cfcaeb71ac84ac686f32b5acb7d84f
            if (!file) {
                return;
            }

            const response = await fetch(`/api/file/${file}`, { cache: "no-cache" });
            const text = await response.text();

            if (text.length > 20e6) {
                this.clusterize.update([ "File is large - gcode view disabled" ]);
            } else {
                const lines = escapeHTML(text.trimRight())
                    .split(/[\r\n]/)
                    .map((line, i) => `<li class="ln${i + 1}"><b>${i + 1}</b>${line}</li>`);

                this.clusterize.update(lines);
            }

            this.empty = false;

            Vue.nextTick(this.update_line);
        },

        clear: function() {
            this.empty = true;
            this.file = "";
            this.line = -1;
            this.clusterize.clear();
        },

        reload: function(file) {
            if (file == this.file) {
                return;
            }
            this.clear();
            this.load(file);
        },

        highlight: function() {
            const highlights = this.$el.querySelectorAll(".highlight");
            for (const highlight of highlights) {
                highlight.className = (highlight.className || "")
                    .split(" ")
                    .filter(c => c !== "highlight")
                    .join(" ");
            }

            const lines = this.$el.querySelectorAll(`.ln${this.line}`);
            for (const line of lines) {
                line.className = (line.className || "")
                    .split(" ")
                    .filter(c => c !== "highlight")
                    .concat([ "highlight" ])
                    .join(" ");
            }
        },

        update_line: function(line) {
            if (typeof line != "undefined") {
                if (this.line == line) {
                    return;
                }

                this.line = line;
            } else {
                line = this.line;
            }

            const totalLines = this.clusterize.getRowsAmount();

            if (line <= 0) {
                line = 1;
            }

            if (totalLines < line) {
                line = totalLines;
            }

            const scroll = this.$el.querySelector(".clusterize-scroll");

            const lineHeight = scroll.scrollHeight / totalLines;
            const linesPerPage = Math.floor(scroll.clientHeight / lineHeight);
            const target = line - 1 - Math.floor(linesPerPage / 2);

            // Update scroll position
            scroll.scrollTop = target * lineHeight;

            Vue.nextTick(this.highlight);
        }
    }
};
