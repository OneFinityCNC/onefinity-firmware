"use strict";

const entityMap = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    "/": "&#x2F;", "`": "&#x60;", "=": "&#x3D;"};

function escapeHTML(s) {
    return s.replace(/[&<>"'`=\\/]/g, function (c) {
        return entityMap[c];
    });
}

module.exports = {
    template: "#gcode-viewer-template",

    data: function () {
        return {
            empty: true,
            file: "",
            line: -1,
            scrolling: false
        };
    },

    events: {
        "gcode-load": function (file) {
            this.load(file);
        },
        "gcode-clear": function () {
            this.clear();
        },
        "gcode-reload": function (file) {
            this.reload(file);
        },
        "gcode-line": function (line) {
            this.update_line(line);
        }
    },

    ready: function () {
        this.clusterize = new Clusterize({
            rows: [],
            scrollElem: $(this.$el).find(".clusterize-scroll")[0],
            contentElem: $(this.$el).find(".clusterize-content")[0],
            no_data_text: "GCode view...",
            callbacks: {clusterChanged: this.highlight}
        });
    },

    attached: function () {
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

            if (!file) {
                return;
            }

            const response = await fetch(`/api/file/${file}?${Math.random()}`);
            const text = await response.text();

            if (text.length > 20e6) {
                this.clusterize.update(["File is large - gcode view disabled"]);
            } else {
                const lines = escapeHTML(text.trimRight())
                    .split(/[\r\n]/)
                    .map((line, i) => `<li class="ln${i + 1}"><b>${i + 1}</b>${line}</li>`);

                this.clusterize.update(lines);
            }

            this.empty = false;

            Vue.nextTick(this.update_line);
        },

        clear: function () {
            this.empty = true;
            this.file = "";
            this.line = -1;
            this.clusterize.clear();
        },

        reload: function (file) {
            if (file != this.file) {
                return;
            }

            this.clear();
            this.load(file);
        },

        highlight: function () {
            let e = $(this.$el).find(".highlight");
            if (e.length) {
                e.removeClass("highlight");
            }

            e = $(this.$el).find(`.ln${this.line}`);
            if (e.length) {
                e.addClass("highlight");
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

            const e = $(this.$el).find(".clusterize-scroll");

            const lineHeight = e[0].scrollHeight / totalLines;
            const linesPerPage = Math.floor(e[0].clientHeight / lineHeight);
            const current = e[0].scrollTop / lineHeight;
            const target = line - 1 - Math.floor(linesPerPage / 2);

            // Update scroll position
            if (!this.scrolling) {
                if (target < current - 20 || current + 20 < target) {
                    e[0].scrollTop = target * lineHeight;
                } else {
                    this.scrolling = true;
                    e.animate({scrollTop: target * lineHeight}, {
                        complete: function () {
                            this.scrolling = false;
                        }.bind(this)
                    });
                }
            }

            Vue.nextTick(this.highlight);
        }
    }
};
