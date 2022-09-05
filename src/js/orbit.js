/**
 * @author qiao / https://github.com/qiao
 * @author mrdoob / http://mrdoob.com
 * @author alteredq / http://alteredqualia.com/
 * @author WestLangley / http://github.com/WestLangley
 * @author erich666 / http://erichaines.com
 * @author jcoffland / https://buildbotics.com/
 */

"use strict";

// This set of controls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up
// (+Y by default).
//
//    Orbit - left mouse / touch: one-finger move
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
//    Pan - right mouse, or arrow keys / touch: two-finger move

const OrbitControls = function (object, domElement) {
    // internals
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scope = this;

    const changeEvent = { type: "change" };
    const startEvent = { type: "start" };
    const endEvent = { type: "end" };

    const STATE = {
        NONE: -1, ROTATE: 0, DOLLY: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_DOLLY_PAN: 4
    };

    let state = STATE.NONE;
    const EPS = 0.000001;

    // current position in spherical coordinates
    const spherical = new THREE.Spherical();
    const sphericalDelta = new THREE.Spherical();

    let scale = 1;
    const panOffset = new THREE.Vector3();
    let zoomChanged = false;

    const rotateStart = new THREE.Vector2();
    const rotateEnd = new THREE.Vector2();
    const rotateDelta = new THREE.Vector2();

    const panStart = new THREE.Vector2();
    const panEnd = new THREE.Vector2();
    const panDelta = new THREE.Vector2();

    const dollyStart = new THREE.Vector2();
    const dollyEnd = new THREE.Vector2();
    const dollyDelta = new THREE.Vector2();

    this.object = object;
    this.domElement = domElement != undefined ? domElement : document;

    // Set to false to disable this control
    this.enabled = true;

    // "target" sets the location of focus, where the object orbits around
    this.target = new THREE.Vector3();

    // How far you can zoom in and out (OrthographicCamera only)
    this.minZoom = 0;
    this.maxZoom = Infinity;

    // How far you can orbit vertically, upper and lower limits.
    // Range is 0 to Math.PI radians.
    this.minPolarAngle = 0; // radians
    this.maxPolarAngle = Math.PI; // radians

    // How far you can orbit horizontally, upper and lower limits.
    // If set, must be a sub-interval of the interval [- Math.PI, Math.PI].
    this.minAzimuthAngle = -Infinity; // radians
    this.maxAzimuthAngle = Infinity; // radians

    // Set to true to enable damping (inertia)
    // If damping is enabled, call controls.update() in your animation loop
    this.enableDamping = false;
    this.dampingFactor = 0.25;

    // This option enables dollying in and out;
    // left as "zoom" for backwards compatibility.
    // Set to false to disable zooming
    this.enableZoom = true;
    this.zoomSpeed = 1.0;

    // Set to false to disable rotating
    this.enableRotate = true;
    this.rotateSpeed = 1.0;

    // Set to false to disable panning
    this.enablePan = true;
    this.panSpeed = 1.0;
    this.screenSpacePanning = false; // if true, pan in screen-space
    this.keyPanSpeed = 7.0; // pixels moved per arrow key push

    // Set to true to automatically rotate around the target
    // If auto-rotate is enabled, call controls.update() in your animation loop
    this.autoRotate = false;
    this.autoRotateSpeed = 2.0; // 30 seconds per round when fps is 60

    // Set to false to disable use of the keys
    this.enableKeys = true;

    // The four arrow keys
    this.keys = { LEFT: 37, UP: 38, RIGHT: 39, BOTTOM: 40 };

    // Mouse buttons
    this.mouseButtons = {
        ORBIT: THREE.MOUSE.LEFT, ZOOM: THREE.MOUSE.MIDDLE, PAN: THREE.MOUSE.RIGHT
    };

    // for reset
    this.target0 = this.target.clone();
    this.position0 = this.object.position.clone();
    this.zoom0 = this.object.zoom;

    // public methods
    this.getPolarAngle = function () {
        return spherical.phi;
    };

    this.getAzimuthalAngle = function () {
        return spherical.theta;
    };

    this.saveState = function () {
        scope.target0.copy(scope.target);
        scope.position0.copy(scope.object.position);
        scope.zoom0 = scope.object.zoom;
    };

    this.reset = function () {
        scope.target.copy(scope.target0);
        scope.object.position.copy(scope.position0);
        scope.object.zoom = scope.zoom0;
        scope.object.updateProjectionMatrix();

        scope.dispatchEvent(changeEvent);
        scope.update();

        state = STATE.NONE;
    };

    this.update = function () {
        const offset = new THREE.Vector3();

        // so camera.up is the orbit axis
        const quat = new THREE.Quaternion().setFromUnitVectors(object.up, new THREE.Vector3(0, 1, 0));
        const quatInverse = quat.clone().inverse();

        const lastPosition = new THREE.Vector3();
        const lastQuaternion = new THREE.Quaternion();

        return function update() {
            const position = scope.object.position;

            offset.copy(position).sub(scope.target);

            // rotate offset to "y-axis-is-up" space
            offset.applyQuaternion(quat);

            // angle from z-axis around y-axis
            spherical.setFromVector3(offset);

            if (scope.autoRotate && state == STATE.NONE) {
                rotateLeft(getAutoRotationAngle());
            }

            spherical.theta += sphericalDelta.theta;
            spherical.phi += sphericalDelta.phi;

            // restrict theta to be between desired limits
            spherical.theta = Math.max(scope.minAzimuthAngle, Math.min(scope.maxAzimuthAngle, spherical.theta));

            // restrict phi to be between desired limits
            spherical.phi = Math.max(scope.minPolarAngle, Math.min(scope.maxPolarAngle, spherical.phi));

            spherical.makeSafe();
            spherical.radius *= scale;

            // restrict radius to be between desired limits
            spherical.radius = Math.max(10, Math.min(scope.object.far * 0.8, spherical.radius));

            // move target to panned location
            scope.target.add(panOffset);

            offset.setFromSpherical(spherical);

            // rotate offset back to "camera-up-vector-is-up" space
            offset.applyQuaternion(quatInverse);

            position.copy(scope.target).add(offset);
            scope.object.lookAt(scope.target);

            if (scope.enableDamping) {
                sphericalDelta.theta *= (1 - scope.dampingFactor);
                sphericalDelta.phi *= (1 - scope.dampingFactor);
                panOffset.multiplyScalar(1 - scope.dampingFactor);

            } else {
                sphericalDelta.set(0, 0, 0);
                panOffset.set(0, 0, 0);
            }

            // update condition is:
            // min(camera displacement, camera rotation in radians)^2 > EPS
            // using small-angle approximation cos(x/2) = 1 - x^2 / 8
            if (zoomChanged
                || scale != 1
                || lastPosition.distanceToSquared(scope.object.position) > EPS
                || 8 * (1 - lastQuaternion.dot(scope.object.quaternion)) > EPS) {

                scope.dispatchEvent(changeEvent);

                lastPosition.copy(scope.object.position);
                lastQuaternion.copy(scope.object.quaternion);
                zoomChanged = false;
                scale = 1;

                return true;
            }

            return false;
        };
    }();

    this.dispose = function () {
        scope.domElement.removeEventListener("contextmenu", onContextMenu, false);
        scope.domElement.removeEventListener("mousedown", onMouseDown, false);
        scope.domElement.removeEventListener("wheel", onMouseWheel, false);
        scope.domElement.removeEventListener("touchstart", onTouchStart, false);
        scope.domElement.removeEventListener("touchend", onTouchEnd, false);
        scope.domElement.removeEventListener("touchmove", onTouchMove, false);
        document.removeEventListener("mousemove", onMouseMove, false);
        document.removeEventListener("mouseup", onMouseUp, false);
        window.removeEventListener("keydown", onKeyDown, false);
    };

    function getAutoRotationAngle() {
        return 2 * Math.PI / 60 / 60 * scope.autoRotateSpeed;
    }

    function getZoomScale() {
        return Math.pow(0.95, scope.zoomSpeed);
    }

    function rotateLeft(angle) {
        sphericalDelta.theta -= angle;
    }

    function rotateUp(angle) {
        sphericalDelta.phi -= angle;
    }

    const panLeft = function () {
        const v = new THREE.Vector3();

        return function panLeft(distance, objectMatrix) {
            v.setFromMatrixColumn(objectMatrix, 0); // get X column of objectMatrix
            v.multiplyScalar(-distance);
            panOffset.add(v);
        };
    }();

    const panUp = function () {
        const v = new THREE.Vector3();

        return function panUp(distance, objectMatrix) {
            if (scope.screenSpacePanning) {
                v.setFromMatrixColumn(objectMatrix, 1);
            } else {
                v.setFromMatrixColumn(objectMatrix, 0);
                v.crossVectors(scope.object.up, v);
            }

            v.multiplyScalar(distance);
            panOffset.add(v);
        };
    }();

    function unknownCamera() {
        console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan & zoom disabled.");
        scope.enablePan = false;
        scope.enableZoom = false;
    }

    // deltaX and deltaY are in pixels; right and down are positive
    const pan = function () {
        const offset = new THREE.Vector3();

        return function pan(deltaX, deltaY) {
            const element = scope.domElement === document
                ? scope.domElement.body
                : scope.domElement;

            if (scope.object.isPerspectiveCamera) {
                // perspective
                offset.copy(scope.object.position).sub(scope.target);
                let targetDistance = offset.length();

                // half of the fov is center to top of screen
                targetDistance *= Math.tan((scope.object.fov / 2) * Math.PI / 180.0);

                // we use only clientHeight here so aspect ratio does not distort speed
                panLeft(2 * deltaX * targetDistance / element.clientHeight, scope.object.matrix);
                panUp(2 * deltaY * targetDistance / element.clientHeight, scope.object.matrix);

            } else if (scope.object.isOrthographicCamera) {
                // orthographic
                panLeft(deltaX * (scope.object.right - scope.object.left) / scope.object.zoom / element.clientWidth, scope.object.matrix);
                panUp(deltaY * (scope.object.top - scope.object.bottom) / scope.object.zoom / element.clientHeight, scope.object.matrix);

            } else {
                unknownCamera();
            }
        };
    }();

    function dollyIn(dollyScale) {
        if (scope.object.isPerspectiveCamera) {
            scale /= dollyScale;
        } else if (scope.object.isOrthographicCamera) {
            scope.object.zoom =
        Math.max(scope.minZoom,
            Math.min(scope.maxZoom, scope.object.zoom * dollyScale));
            scope.object.updateProjectionMatrix();
            zoomChanged = true;

        } else {
            unknownCamera();
        }
    }

    function dollyOut(dollyScale) {
        if (scope.object.isPerspectiveCamera) {
            scale *= dollyScale;
        } else if (scope.object.isOrthographicCamera) {
            scope.object.zoom =
        Math.max(scope.minZoom,
            Math.min(scope.maxZoom, scope.object.zoom / dollyScale));
            scope.object.updateProjectionMatrix();
            zoomChanged = true;

        } else {
            unknownCamera();
        }
    }

    // event callbacks - update the object state
    function handleMouseDownRotate(event) {
        rotateStart.set(event.clientX, event.clientY);
    }

    function handleMouseDownDolly(event) {
        dollyStart.set(event.clientX, event.clientY);
    }

    function handleMouseDownPan(event) {
        panStart.set(event.clientX, event.clientY);
    }

    function handleMouseMoveRotate(event) {
        rotateEnd.set(event.clientX, event.clientY);
        rotateDelta.subVectors(rotateEnd, rotateStart)
            .multiplyScalar(scope.rotateSpeed);

        const element = scope.domElement === document ?
            scope.domElement.body : scope.domElement;

        // yes, height
        rotateLeft(2 * Math.PI * rotateDelta.x / element.clientHeight);
        rotateUp(2 * Math.PI * rotateDelta.y / element.clientHeight);

        rotateStart.copy(rotateEnd);

        scope.update();
    }

    function handleMouseMoveDolly(event) {
        dollyEnd.set(event.clientX, event.clientY);
        dollyDelta.subVectors(dollyEnd, dollyStart);

        if (dollyDelta.y > 0) {
            dollyIn(getZoomScale());
        } else if (dollyDelta.y < 0) {
            dollyOut(getZoomScale());
        }

        dollyStart.copy(dollyEnd);
        scope.update();
    }

    function handleMouseMovePan(event) {
        panEnd.set(event.clientX, event.clientY);
        panDelta.subVectors(panEnd, panStart).multiplyScalar(scope.panSpeed);
        pan(panDelta.x, panDelta.y);
        panStart.copy(panEnd);
        scope.update();
    }

    function handleMouseWheel(event) {
        if (event.deltaY < 0) {
            dollyOut(getZoomScale());
        } else if (event.deltaY > 0) {
            dollyIn(getZoomScale());
        }

        scope.update();
    }

    function handleKeyDown(event) {
        switch (event.keyCode) {
            case scope.keys.UP:
                pan(0, scope.keyPanSpeed);
                scope.update();
                break;

            case scope.keys.BOTTOM:
                pan(0, -scope.keyPanSpeed);
                scope.update();
                break;

            case scope.keys.LEFT:
                pan(scope.keyPanSpeed, 0);
                scope.update();
                break;

            case scope.keys.RIGHT:
                pan(-scope.keyPanSpeed, 0);
                scope.update();
                break;
        }
    }

    function handleTouchStartRotate(event) {
        rotateStart.set(event.touches[0].pageX, event.touches[0].pageY);
    }

    function handleTouchStartDollyPan(event) {
        if (scope.enableZoom) {
            const dx = event.touches[0].pageX - event.touches[1].pageX;
            const dy = event.touches[0].pageY - event.touches[1].pageY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            dollyStart.set(0, distance);
        }

        if (scope.enablePan) {
            const x = 0.5 * (event.touches[0].pageX + event.touches[1].pageX);
            const y = 0.5 * (event.touches[0].pageY + event.touches[1].pageY);
            panStart.set(x, y);
        }
    }

    function handleTouchMoveRotate(event) {
        rotateEnd.set(event.touches[0].pageX, event.touches[0].pageY);
        rotateDelta.subVectors(rotateEnd, rotateStart)
            .multiplyScalar(scope.rotateSpeed);

        const element = scope.domElement === document ?
            scope.domElement.body : scope.domElement;

        // yes, height
        rotateLeft(2 * Math.PI * rotateDelta.x / element.clientHeight);
        rotateUp(2 * Math.PI * rotateDelta.y / element.clientHeight);
        rotateStart.copy(rotateEnd);
        scope.update();
    }

    function handleTouchMoveDollyPan(event) {
        if (scope.enableZoom) {
            const dx = event.touches[0].pageX - event.touches[1].pageX;
            const dy = event.touches[0].pageY - event.touches[1].pageY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            dollyEnd.set(0, distance);
            dollyDelta.set(0, Math.pow(dollyEnd.y / dollyStart.y, scope.zoomSpeed));
            dollyIn(dollyDelta.y);
            dollyStart.copy(dollyEnd);
        }

        if (scope.enablePan) {
            const x = 0.5 * (event.touches[0].pageX + event.touches[1].pageX);
            const y = 0.5 * (event.touches[0].pageY + event.touches[1].pageY);

            panEnd.set(x, y);
            panDelta.subVectors(panEnd, panStart).multiplyScalar(scope.panSpeed);
            pan(panDelta.x, panDelta.y);
            panStart.copy(panEnd);
        }

        scope.update();
    }

    // event handlers - listen for events and reset state
    function onMouseDown(event) {
        if (!scope.enabled) {
            return;
        }

        event.preventDefault();

        switch (event.button) {
            case scope.mouseButtons.ORBIT:
                if (!scope.enableRotate) {
                    return;
                }
                handleMouseDownRotate(event);
                state = STATE.ROTATE;
                break;

            case scope.mouseButtons.ZOOM:
                if (!scope.enableZoom) {
                    return;
                }
                handleMouseDownDolly(event);
                state = STATE.DOLLY;
                break;

            case scope.mouseButtons.PAN:
                if (!scope.enablePan) {
                    return;
                }
                handleMouseDownPan(event);
                state = STATE.PAN;
                break;
        }

        if (state != STATE.NONE) {
            document.addEventListener("mousemove", onMouseMove, false);
            document.addEventListener("mouseup", onMouseUp, false);
            scope.dispatchEvent(startEvent);
        }
    }

    function onMouseMove(event) {
        if (!scope.enabled) {
            return;
        }

        event.preventDefault();

        switch (state) {
            case STATE.ROTATE:
                if (!scope.enableRotate) {
                    return;
                }
                handleMouseMoveRotate(event);
                break;

            case STATE.DOLLY:
                if (!scope.enableZoom) {
                    return;
                }
                handleMouseMoveDolly(event);
                break;

            case STATE.PAN:
                if (!scope.enablePan) {
                    return;
                }
                handleMouseMovePan(event);
                break;
        }
    }

    function onMouseUp() {
        if (!scope.enabled) {
            return;
        }

        document.removeEventListener("mousemove", onMouseMove, false);
        document.removeEventListener("mouseup", onMouseUp, false);
        scope.dispatchEvent(endEvent);
        state = STATE.NONE;
    }

    function onMouseWheel(event) {
        if (!scope.enabled || !scope.enableZoom ||
        (state != STATE.NONE && state != STATE.ROTATE)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        scope.dispatchEvent(startEvent);
        handleMouseWheel(event);
        scope.dispatchEvent(endEvent);
    }

    function onKeyDown(event) {
        if (!scope.enabled || !scope.enableKeys || !scope.enablePan) {
            return;
        }

        handleKeyDown(event);
    }

    function onTouchStart(event) {
        if (!scope.enabled) {
            return;
        }

        event.preventDefault();

        switch (event.touches.length) {
            case 1: // one-fingered touch: rotate
                if (!scope.enableRotate) {
                    return;
                }
                handleTouchStartRotate(event);
                state = STATE.TOUCH_ROTATE;
                break;

            case 2: // two-fingered touch: dolly-pan
                if (!scope.enableZoom && !scope.enablePan) {
                    return;
                }
                handleTouchStartDollyPan(event);
                state = STATE.TOUCH_DOLLY_PAN;
                break;

            default: state = STATE.NONE;
        }

        if (state != STATE.NONE) {
            scope.dispatchEvent(startEvent);
        }
    }

    function onTouchMove(event) {
        if (!scope.enabled) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        switch (event.touches.length) {
            case 1: // one-fingered touch: rotate
                if (!scope.enableRotate) {
                    return;
                }
                if (state != STATE.TOUCH_ROTATE) {
                    return;
                } // is this needed?

                handleTouchMoveRotate(event);
                break;

            case 2: // two-fingered touch: dolly-pan
                if (!scope.enableZoom && !scope.enablePan) {
                    return;
                }
                if (state != STATE.TOUCH_DOLLY_PAN) {
                    return;
                } // is this needed?

                handleTouchMoveDollyPan(event);
                break;

            default: state = STATE.NONE;
        }
    }

    function onTouchEnd() {
        if (!scope.enabled) {
            return;
        }

        scope.dispatchEvent(endEvent);
        state = STATE.NONE;
    }

    function onContextMenu(event) {
        if (!scope.enabled) {
            return;
        }
        event.preventDefault();
    }

    scope.domElement.addEventListener("contextmenu", onContextMenu, false);
    scope.domElement.addEventListener("mousedown", onMouseDown, false);
    scope.domElement.addEventListener("wheel", onMouseWheel, false);
    scope.domElement.addEventListener("touchstart", onTouchStart, false);
    scope.domElement.addEventListener("touchend", onTouchEnd, false);
    scope.domElement.addEventListener("touchmove", onTouchMove, false);
    window.addEventListener("keydown", onKeyDown, false);

    this.update(); // force an update at start
};

OrbitControls.prototype = Object.create(THREE.EventDispatcher.prototype);
OrbitControls.prototype.constructor = OrbitControls;
module.exports = OrbitControls;
