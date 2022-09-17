DIR := $(shell dirname $(lastword $(MAKEFILE_LIST)))

NODE_MODS  := $(DIR)/node_modules
PUG        := $(NODE_MODS)/.bin/pug

TARGET_DIR := build/http
HTML       := index
HTML       := $(patsubst %,$(TARGET_DIR)/%.html,$(HTML))
RESOURCES  := $(shell find src/resources -type f)
RESOURCES  := $(patsubst src/resources/%,$(TARGET_DIR)/%,$(RESOURCES))
TEMPLS     := $(wildcard src/pug/templates/*.pug)

AVR_FIRMWARE := src/avr/bbctrl-avr-firmware.hex
GPLAN_MOD    := rpi-share/camotics/gplan.so
GPLAN_TARGET := src/py/camotics/gplan.so
GPLAN_IMG    := gplan-dev.img

VERSION := $(shell jq -r '.version' package.json)
PY_VERSION := $(shell jq -r '.version' package.json | grep -P '^\d+\.\d+\.\d+(-(alpha|beta)\.\d+)?$$' | sed -E 's|-((a)lpha\|(b)eta)\.(.*)|\2\3\4|g')
PKG_NAME := dist/bbctrl-$(PY_VERSION).tar.bz2
FINAL_PKG_NAME := dist/onefinity-$(VERSION).tar.bz2

SUBPROJECTS := avr boot pwr

ifndef HOST
HOST=onefinity
endif

ifndef PASSWORD
PASSWORD=onefinity
endif

all: version $(HTML) $(RESOURCES)
	@for SUB in $(SUBPROJECTS); do $(MAKE) -C src/$$SUB; done

version:
ifeq ("$(PY_VERSION)", "")
	@echo "Bad version string: $(VERSION)"
	@exit 1
endif

	@echo "****************************"
	@echo "*"
	@echo "*  Building $(PY_VERSION)"
	@echo "*"
	@echo "****************************"
	@echo

pkg: all $(AVR_FIRMWARE) bbserial
	./setup.py sdist
	mv $(PKG_NAME) $(FINAL_PKG_NAME)

bbserial:
	$(MAKE) -C src/bbserial

gplan: $(GPLAN_TARGET)

$(GPLAN_TARGET): $(GPLAN_MOD)
	cp $< $@

$(GPLAN_MOD): $(GPLAN_IMG)
	./scripts/gplan-init-build.sh
	cp ./scripts/gplan-build.sh rpi-share/
	chmod +x rpi-share/gplan-build.sh
	sudo ./scripts/rpi-chroot.sh $(GPLAN_IMG) /mnt/host/gplan-build.sh

$(GPLAN_IMG):
	./scripts/gplan-init-build.sh

.PHONY: $(AVR_FIRMWARE)
$(AVR_FIRMWARE):
	$(MAKE) -C src/avr

update: pkg
	curl -i -X PUT -H "Content-Type: multipart/form-data" \
	  -F "firmware=@$(FINAL_PKG_NAME)" -F "password=$(PASSWORD)" \
	  http://$(HOST)/api/firmware/update
	@-tput sgr0 && echo # Fix terminal output

build/templates.pug: $(TEMPLS)
	mkdir -p build
	cat $(TEMPLS) >$@

node_modules: package.json
	npm install && touch node_modules

$(TARGET_DIR)/%: src/resources/%
	install -D $< $@

src/svelte-components/dist/%:
	cd src/svelte-components && rm -rf dist && npm run build

$(TARGET_DIR)/index.html: build/templates.pug
$(TARGET_DIR)/index.html: $(wildcard src/static/js/*)
$(TARGET_DIR)/index.html: $(wildcard src/static/css/*)
$(TARGET_DIR)/index.html: $(wildcard src/pug/templates/*)
$(TARGET_DIR)/index.html: $(wildcard src/js/*)
$(TARGET_DIR)/index.html: $(wildcard src/stylus/*)
$(TARGET_DIR)/index.html: src/resources/config-template.json
$(TARGET_DIR)/index.html: $(wildcard src/resources/onefinity*defaults.json)
$(TARGET_DIR)/index.html: $(wildcard src/svelte-components/dist/*)

FORCE:

$(TARGET_DIR)/%.html: src/pug/%.pug node_modules FORCE
	cd src/svelte-components && rm -rf dist && npm run build
	@mkdir -p $(TARGET_DIR)/svelte-components
	cp src/svelte-components/dist/* $(TARGET_DIR)/svelte-components/

	@mkdir -p $(TARGET_DIR)
	$(PUG) -O pug-opts.js -P $< -o $(TARGET_DIR) || (rm -f $@; exit 1)

clean:
	rm -rf rpi-share
	git clean -fxd

.PHONY: all install clean tidy pkg gplan lint pylint jshint bbserial
