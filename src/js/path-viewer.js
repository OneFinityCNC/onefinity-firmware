"use strict";

const orbit = require("./orbit");
const cookie = require("./cookie")("bbctrl-");
const font = require("./helvetiker_regular.typeface.json");

module.exports = {
    template: "#path-viewer-template",
    props: ["toolpath"],

    data: function () {
        return {
            enabled: false,
            loading: false,
            dirty: true,
            snapView: cookie.get("snap-view", "isometric"),
            small: cookie.get_bool("small-path-view", true),
            surfaceMode: "cut",
            showPath: cookie.get_bool("show-path", true),
            showTool: cookie.get_bool("show-tool", true),
            showBBox: cookie.get_bool("show-bbox", true),
            showAxes: cookie.get_bool("show-axes", true),
            showIntensity: cookie.get_bool("show-intensity", false)
        };
    },

    computed: {
        target: function () {
            return this.$el.querySelector(".path-viewer-content");
        },

        webglAvailable: function() {
            // Create canvas element. The canvas is not added to the
            // document itself, so it is never displayed in the
            // browser window.
            const canvas = document.createElement("canvas");

            // Get WebGLRenderingContext from canvas element.
            const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

            // Report the result.
            return gl && gl instanceof WebGLRenderingContext;
        }
    },

    watch: {
        toolpath: function () {
            Vue.nextTick(this.update);
        },

        surfaceMode: function (mode) {
            this.update_surface_mode(mode);
        },

        small: function (enable) {
            cookie.set_bool("small-path-view", enable);
            Vue.nextTick(this.update_view);
        },

        showPath: function (enable) {
            cookie.set_bool("show-path", enable);
            this.set_visible(this.pathView, enable);
        },

        showTool: function (enable) {
            cookie.set_bool("show-tool", enable);
            this.set_visible(this.toolView, enable);
        },

        showAxes: function (enable) {
            cookie.set_bool("show-axes", enable);
            this.set_visible(this.axesView, enable);
        },

        showIntensity: function (enable) {
            cookie.set_bool("show-intensity", enable);
            Vue.nextTick(this.update);
        },

        showBBox: function (enable) {
            cookie.set_bool("show-bbox", enable);
            this.set_visible(this.bboxView, enable);
            this.set_visible(this.envelopeView, enable);
        },

        x: function () {
            this.axis_changed();
        },

        y: function () {
            this.axis_changed();
        },

        z: function () {
            this.axis_changed();
        }
    },

    ready: function () {
        this.graphics();
        Vue.nextTick(this.update);
    },

    methods: {
        update: async function () {
            if (!this.webglAvailable) {
                return;
            }

            if (!this.state.selected) {
                this.dirty = true;
                this.scene = new THREE.Scene();

            } else if (!this.toolpath.filename && !this.loading) {
                this.loading = true;
                this.dirty = true;
                this.draw_loading();
            }

            if (!this.enabled || !this.toolpath.filename) {
                return;
            }

            async function get(url) {
                const response = await fetch(`${url}`, { cache: "no-cache" });
                const arrayBuffer = await response.arrayBuffer();

                return new Float32Array(arrayBuffer);
            }

            const [positions, speeds] = await Promise.all([
                get(`/api/path/${this.toolpath.filename}/positions`),
                get(`/api/path/${this.toolpath.filename}/speeds`)
            ]);

            this.positions = positions;
            this.speeds = speeds;
            this.loading = false;

            // Update scene
            this.scene = new THREE.Scene();
            this.draw(this.scene);
            this.snap(this.snapView);

            this.update_view();
        },

        update_surface_mode: function (mode) {
            if (!this.enabled) {
                return;
            }

            if (typeof this.surfaceMaterial != "undefined") {
                this.surfaceMaterial.wireframe = mode == "wire";
                this.surfaceMaterial.needsUpdate = true;
            }

            this.set_visible(this.surfaceMesh, mode == "cut" || mode == "wire");
            this.set_visible(this.workpieceMesh, mode == "solid");
        },

        load_surface: function (surface) {
            if (typeof surface == "undefined") {
                this.vertices = undefined;
                this.normals = undefined;
                return;
            }

            this.vertices = surface.vertices;

            // Expand normals
            this.normals = [];
            for (let i = 0; i < surface.normals.length / 3; i++) {
                for (let j = 0; j < 3; j++) {
                    for (let k = 0; k < 3; k++) {
                        this.normals.push(surface.normals[i * 3 + k]);
                    }
                }
            }
        },

        set_visible: function (target, visible) {
            if (typeof target != "undefined") {
                target.visible = visible;
            }
            this.dirty = true;
        },

        get_dims: function () {
            const computedStyle = window.getComputedStyle(this.target);

            return {
                width: parseInt(computedStyle.width),
                height: parseInt(computedStyle.height)
            };
        },

        update_view: function () {
            if (!this.enabled) {
                return;
            }

            const dims = this.get_dims();

            this.camera.aspect = dims.width / dims.height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(dims.width, dims.height);

            if (this.loading) {
                this.controls.reset();
                this.camera.position.copy(new THREE.Vector3(0, 0, 600));
                this.camera.lookAt(new THREE.Vector3(0, 0, 0));
            }

            this.dirty = true;
        },

        update_tool: function (tool) {
            if (!this.enabled) {
                return;
            }

            if (typeof tool == "undefined") {
                tool = this.toolView;
            }

            if (typeof tool == "undefined") {
                return;
            }

            tool.position.x = this.x.pos;
            tool.position.y = this.y.pos;
            tool.position.z = this.z.pos;
        },

        update_envelope: function (envelope) {
            if (!this.enabled || !this.axes.homed) {
                return;
            }

            if (typeof envelope == "undefined") {
                envelope = this.envelopeView;
            }

            if (typeof envelope == "undefined") {
                return;
            }

            const min = new THREE.Vector3();
            const max = new THREE.Vector3();

            for (const axis of "xyz") {
                min[axis] = this[axis].min - this[axis].off;
                max[axis] = this[axis].max - this[axis].off;
            }

            const bounds = new THREE.Box3(min, max);
            if (bounds.isEmpty()) {
                envelope.geometry = this.create_empty_geom();
            } else {
                envelope.geometry = this.create_bbox_geom(bounds);
            }
        },

        axis_changed: function () {
            this.update_tool();
            this.update_envelope();
            this.dirty = true;
        },

        graphics: function () {
            if (!this.webglAvailable) {
                return;
            }

            try {
                // Renderer
                this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
                this.renderer.setPixelRatio(window.devicePixelRatio);
                this.renderer.setClearColor(0, 0);
                this.target.appendChild(this.renderer.domElement);

            } catch (e) {
                console.log("WebGL not supported: ", e);
                return;
            }

            this.enabled = true;

            // Camera
            this.camera = new THREE.PerspectiveCamera(45, 4 / 3, 1, 10000);

            // Lighting
            this.ambient = new THREE.AmbientLight(0xffffff, 0.5);

            const keyLight = new THREE.DirectionalLight(new THREE.Color("hsl(30, 100%, 75%)"), 0.75);
            keyLight.position.set(-100, 0, 100);

            const fillLight = new THREE.DirectionalLight(new THREE.Color("hsl(240, 100%, 75%)"), 0.25);
            fillLight.position.set(100, 0, 100);

            const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
            backLight.position.set(100, 0, -100).normalize();

            this.lights = new THREE.Group();
            this.lights.add(keyLight);
            this.lights.add(fillLight);
            this.lights.add(backLight);

            // Surface material
            this.surfaceMaterial = this.create_surface_material();

            // Controls
            this.controls = new orbit(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.2;
            this.controls.rotateSpeed = 0.25;
            this.controls.enableZoom = true;

            // Move lights with scene
            this.controls.addEventListener("change", function (scope) {
                return function () {
                    keyLight.position.copy(scope.camera.position);
                    fillLight.position.copy(scope.camera.position);
                    backLight.position.copy(scope.camera.position);
                    keyLight.lookAt(scope.controls.target);
                    fillLight.lookAt(scope.controls.target);
                    backLight.lookAt(scope.controls.target);
                    scope.dirty = true;
                };
            }(this));

            // Events
            window.addEventListener("resize", this.update_view, false);

            // Start it
            this.render();
        },

        create_surface_material: function () {
            return new THREE.MeshPhongMaterial({
                specular: 0x111111,
                shininess: 10,
                side: THREE.FrontSide,
                color: 0x0c2d53
            });
        },

        draw_loading: function () {
            this.scene = new THREE.Scene();

            const geometry = new THREE.TextGeometry("Loading 3D View...", {
                font: new THREE.Font(font),
                size: 40,
                height: 5,
                curveSegments: 12,
                bevelEnabled: true,
                bevelThickness: 10,
                bevelSize: 8,
                bevelSegments: 5
            });
            geometry.computeBoundingBox();

            const mesh = new THREE.Mesh(geometry, this.surfaceMaterial);

            this.scene.add(mesh);
            this.scene.add(this.ambient);
            this.scene.add(this.lights);
            this.update_view();
        },

        draw_workpiece: function (scene, material) {
            if (typeof this.workpiece == "undefined") {
                return;
            }

            let min = this.workpiece.min;
            let max = this.workpiece.max;

            min = new THREE.Vector3(min[0], min[1], min[2]);
            max = new THREE.Vector3(max[0], max[1], max[2]);
            const dims = max.clone().sub(min);

            const geometry = new THREE.BoxGeometry(dims.x, dims.y, dims.z);
            const mesh = new THREE.Mesh(geometry, material);

            const offset = dims.clone();
            offset.divideScalar(2);
            offset.add(min);

            mesh.position.add(offset);

            geometry.computeBoundingBox();

            scene.add(mesh);

            return mesh;
        },

        draw_surface: function (scene, material) {
            if (typeof this.vertices == "undefined") {
                return;
            }

            const geometry = new THREE.BufferGeometry();

            geometry.addAttribute("position", new THREE.Float32BufferAttribute(this.vertices, 3));
            geometry.addAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));

            geometry.computeBoundingSphere();
            geometry.computeBoundingBox();

            return new THREE.Mesh(geometry, material);
        },

        draw_tool: function (scene, bbox) {
            // Tool size is relative to bounds
            const size = bbox.getSize(new THREE.Vector3());
            let length = (size.x + size.y + size.z) / 24;

            if (length < 1) {
                length = 1;
            }

            const material = new THREE.MeshPhongMaterial({
                transparent: true,
                opacity: 0.75,
                specular: 0x161616,
                shininess: 10,
                color: 0xffa500 // Orange
            });

            const geometry = new THREE.CylinderGeometry(length / 2, 0, length, 128);
            geometry.translate(0, length / 2, 0);
            geometry.rotateX(0.5 * Math.PI);

            const mesh = new THREE.Mesh(geometry, material);
            this.update_tool(mesh);
            mesh.visible = this.showTool;
            scene.add(mesh);
            return mesh;
        },

        draw_axis: function (axis, up, length, radius) {
            let color;

            if (axis == 0) {
                color = 0xff0000;
            } else if (axis == 1) {
                color = 0x00ff00;
            } else if (axis == 2) {
                color = 0x0000ff;
            }

            const group = new THREE.Group();
            const material = new THREE.MeshPhongMaterial({
                specular: 0x161616, shininess: 10, color: color
            });
            let geometry = new THREE.CylinderGeometry(radius, radius, length, 128);
            geometry.translate(0, -length / 2, 0);
            group.add(new THREE.Mesh(geometry, material));

            geometry = new THREE.CylinderGeometry(1.5 * radius, 0, 2 * radius, 128);
            geometry.translate(0, -length - radius, 0);
            group.add(new THREE.Mesh(geometry, material));

            if (axis == 0)      {
                group.rotateZ((up ? 0.5 : 1.5) * Math.PI);
            } else if (axis == 1) {
                group.rotateX((up ? 0   : 1  ) * Math.PI);
            } else if (axis == 2) {
                group.rotateX((up ? 1.5 : 0.5) * Math.PI);
            }

            return group;
        },

        draw_axes: function (scene, bbox) {
            const size = bbox.getSize(new THREE.Vector3());
            let length = (size.x + size.y + size.z) / 3;
            length /= 10;

            if (length < 1) {
                length = 1;
            }

            const radius = length / 20;

            const group = new THREE.Group();

            for (let axis = 0; axis < 3; axis++) {
                for (let up = 0; up < 2; up++) {
                    group.add(this.draw_axis(axis, up, length, radius));
                }
            }

            group.visible = this.showAxes;
            scene.add(group);

            return group;
        },

        get_color: function (speed) {
            if (isNaN(speed)) {
                return [255, 0, 0];
            } // Rapid

            let intensity = speed / this.toolpath.maxSpeed;
            if (typeof speed == "undefined" || !this.showIntensity) {
                intensity = 1;
            }

            return [0, 255 * intensity, 127 * (1 - intensity)];
        },

        draw_path: function (scene) {
            const geometry = new THREE.BufferGeometry();
            const material = new THREE.LineBasicMaterial({
                vertexColors: THREE.VertexColors,
                linewidth: 1.5
            });

            const positions = new THREE.Float32BufferAttribute(this.positions, 3);
            geometry.addAttribute("position", positions);

            let colors = [];
            for (let i = 0; i < this.speeds.length; i++) {
                const color = this.get_color(this.speeds[i]);
                Array.prototype.push.apply(colors, color);
            }

            colors = new THREE.Uint8BufferAttribute(colors, 3, true);
            geometry.addAttribute("color", colors);

            geometry.computeBoundingSphere();
            geometry.computeBoundingBox();

            const line = new THREE.Line(geometry, material);

            line.visible = this.showPath;
            scene.add(line);

            return line;
        },

        create_empty_geom: function () {
            const geometry = new THREE.BufferGeometry();
            geometry.addAttribute("position",
                new THREE.Float32BufferAttribute([], 3));
            return geometry;
        },

        create_bbox_geom: function (bbox) {
            const vertices = [];

            if (!bbox.isEmpty()) {
                // Top
                vertices.push(bbox.min.x, bbox.min.y, bbox.min.z);
                vertices.push(bbox.max.x, bbox.min.y, bbox.min.z);
                vertices.push(bbox.max.x, bbox.min.y, bbox.min.z);
                vertices.push(bbox.max.x, bbox.min.y, bbox.max.z);
                vertices.push(bbox.max.x, bbox.min.y, bbox.max.z);
                vertices.push(bbox.min.x, bbox.min.y, bbox.max.z);
                vertices.push(bbox.min.x, bbox.min.y, bbox.max.z);
                vertices.push(bbox.min.x, bbox.min.y, bbox.min.z);

                // Bottom
                vertices.push(bbox.min.x, bbox.max.y, bbox.min.z);
                vertices.push(bbox.max.x, bbox.max.y, bbox.min.z);
                vertices.push(bbox.max.x, bbox.max.y, bbox.min.z);
                vertices.push(bbox.max.x, bbox.max.y, bbox.max.z);
                vertices.push(bbox.max.x, bbox.max.y, bbox.max.z);
                vertices.push(bbox.min.x, bbox.max.y, bbox.max.z);
                vertices.push(bbox.min.x, bbox.max.y, bbox.max.z);
                vertices.push(bbox.min.x, bbox.max.y, bbox.min.z);

                // Sides
                vertices.push(bbox.min.x, bbox.min.y, bbox.min.z);
                vertices.push(bbox.min.x, bbox.max.y, bbox.min.z);
                vertices.push(bbox.max.x, bbox.min.y, bbox.min.z);
                vertices.push(bbox.max.x, bbox.max.y, bbox.min.z);
                vertices.push(bbox.max.x, bbox.min.y, bbox.max.z);
                vertices.push(bbox.max.x, bbox.max.y, bbox.max.z);
                vertices.push(bbox.min.x, bbox.min.y, bbox.max.z);
                vertices.push(bbox.min.x, bbox.max.y, bbox.max.z);
            }

            const geometry = new THREE.BufferGeometry();

            geometry.addAttribute("position",
                new THREE.Float32BufferAttribute(vertices, 3));

            return geometry;
        },

        draw_bbox: function (scene, bbox) {
            const geometry = this.create_bbox_geom(bbox);
            const material = new THREE.LineBasicMaterial({color: 0xffffff});
            const line = new THREE.LineSegments(geometry, material);

            line.visible = this.showBBox;

            scene.add(line);

            return line;
        },

        draw_envelope: function (scene) {
            const geometry = this.create_empty_geom();
            const material = new THREE.LineBasicMaterial({color: 0x00f7ff});
            const line = new THREE.LineSegments(geometry, material);

            line.visible = this.showBBox;

            scene.add(line);
            this.update_envelope(line);

            return line;
        },

        draw: function (scene) {
            // Lights
            scene.add(this.ambient);
            scene.add(this.lights);

            // Model
            this.pathView = this.draw_path(scene);
            this.surfaceMesh = this.draw_surface(scene, this.surfaceMaterial);
            this.workpieceMesh = this.draw_workpiece(scene, this.surfaceMaterial);
            this.update_surface_mode(this.surfaceMode);

            // Compute bounding box
            const bbox = this.get_model_bounds();

            // Tool, axes & bounds
            this.toolView = this.draw_tool(scene, bbox);
            this.axesView = this.draw_axes(scene, bbox);
            this.bboxView = this.draw_bbox(scene, bbox);
            this.envelopeView = this.draw_envelope(scene);
        },

        render: function () {
            window.requestAnimationFrame(this.render);

            if (typeof this.scene == "undefined") {
                return;
            }

            if (this.controls.update() || this.dirty) {
                this.dirty = false;
                this.renderer.render(this.scene, this.camera);
            }
        },

        get_model_bounds: function () {
            const bbox = new THREE.Box3(new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0.00001, 0.00001, 0.00001));

            function add(o) {
                if (typeof o != "undefined") {
                    const oBBox = new THREE.Box3();
                    oBBox.setFromObject(o);
                    bbox.union(oBBox);
                }
            }

            add(this.pathView);
            add(this.surfaceMesh);
            add(this.workpieceMesh);

            return bbox;
        },

        snap: function (view) {
            if (this.loading) {
                return;
            }

            if (view != this.snapView) {
                this.snapView = view;
                cookie.set("snap-view", view);
            }

            const bbox = this.get_model_bounds();
            this.controls.reset();
            bbox.getCenter(this.controls.target);
            this.update_view();

            // Compute new camera position
            const center = bbox.getCenter(new THREE.Vector3());
            const offset = new THREE.Vector3();

            switch (view) {
                case "isometric": offset.y -= 1; offset.z += 1; break;
                case "front": offset.y -= 1; break;
                case "back": offset.y += 1; break;
                case "left": offset.x -= 1; break;
                case "right": offset.x += 1; break;
                case "top": offset.z += 1; break;
                case "bottom": offset.z -= 1; break;
            }

            offset.normalize();

            // Initial camera position
            const position = new THREE.Vector3().copy(center).add(offset);
            this.camera.position.copy(position);
            this.camera.lookAt(center); // Get correct camera orientation

            const theta = this.camera.fov / 180 * Math.PI; // View angle
            const cameraLine = new THREE.Line3(center, position);
            const cameraUp = new THREE.Vector3()
                .copy(this.camera.up)
                .applyQuaternion(this.camera.quaternion);
            const cameraLeft = new THREE.Vector3()
                .copy(offset)
                .cross(cameraUp)
                .normalize();

            const corners = [
                new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.min.z),
                new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.max.z),
                new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.min.z),
                new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.max.z),
                new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.min.z),
                new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.max.z),
                new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.min.z),
                new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.max.z),
            ];

            let dist = this.camera.near; // Min camera dist

            for (let i = 0; i < corners.length; i++) {
                // Project on to camera line
                const p1 = cameraLine.closestPointToPoint(corners[i], false, new THREE.Vector3());

                // Compute distance from projection to center
                let d = p1.distanceTo(center);
                if (cameraLine.closestPointToPointParameter(p1, false) < 0) {
                    d = -d;
                }

                // Compute up line
                const up = new THREE.Line3(p1, new THREE.Vector3().copy(p1).add(cameraUp));

                // Project on to up line
                const p2 = up.closestPointToPoint(corners[i], false, new THREE.Vector3());

                // Compute length
                let l = p1.distanceTo(p2);

                // Update min camera distance
                dist = Math.max(dist, d + l / Math.tan(theta / 2));

                // Compute left line
                const left = new THREE.Line3(p1, new THREE.Vector3().copy(p1).add(cameraLeft));

                // Project on to left line
                const p3 = left.closestPointToPoint(corners[i], false, new THREE.Vector3());

                // Compute length
                l = p1.distanceTo(p3);

                // Update min camera distance
                dist = Math.max(dist, d + l / Math.tan(theta / 2) / this.camera.aspect);
            }

            this.camera.position.copy(offset.multiplyScalar(dist * 1.2).add(center));
        }
    },

    mixins: [require("./axis-vars")]
};
