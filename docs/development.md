# Onefinity CNC Controller Development Guide

This document describes how to setup your environment for Onefinity CNC controller development on Debian Linux. Development on other systems is not supported.

<br />

## Getting Started

The simplest way get started is to use Visual Studio Code's [Remote Containers](https://code.visualstudio.com/docs/remote/containers) feature.

1. Install Docker
2. Install [Visual Studio Code](https://code.visualstudio.com/download)
3. Install the Remote Containers feature
    * In VSCode, press Cmd+Shift+P, then type Install Extensions
    * In the side-panel that pops up, search for Remote Containers
    * Install the "Remote - Containers" extension from
4. Clone this repository to your local filesystem
5. Open the repository from within VSCode
    * VSCode should show a popup that says:

          Folder contains a Dev Container configuration file.  Reopen folder to develop in a container.

    * Click the button that says "Reopen in Container"

VSCode will build a container that is properly configured for working on the Onefinity codebase, and mount the repository folder tree inside the container.

<br />
<br />

## Getting Started - The Hard Way
If you prefer, you can instead setup a full Debian environment on a physical or virtual machine.

See `./devcontainer/install_tools.sh` for the tools that must be installed.

<br />

## Build the firmware

    make

<br />

## Build the `gplan` module

GPlan is a Python module written in C++.  It must be compiled for ARM so that it can be used on the Raspberry Pi.  This is accomplished using a `chroot`, `qemu` and `binfmt` to create an emulated ARM build environment.  This is faster and more convenient than building on the RPi itself.  All of this is automated.

    make gplan

The first time this is run it will take quite awhile as it setups up the build environment.  You can run the above command again later to build the latest version.

<br />

## Build the upgrade package

    make pkg

This will generate `dist/onefinity-<version>.tar.bz2`

<br />

## Upload to the controller
If you have a Onefinity CNC controller at ``onefinity.local``, the default address, you can upgrade it with the new package like this:

    make update

If you have changed the default hostname of your controller, or if the name is not resolving, you can use the `HOST` environment variable to override the default

    make update HOST=myhostname

<br />

## Logging into the Buildbotics Controller

You can ssh in to the Buildbotics Controller like so:

    ssh bbmc@onefinity

The default password is `onefinity`.

