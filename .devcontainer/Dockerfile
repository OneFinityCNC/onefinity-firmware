# See here for image contents: https://github.com/microsoft/vscode-dev-containers/blob/v0.241.1/containers/debian/.devcontainer/base.Dockerfile

# [Choice] Debian version (use bullseye on local arm64/Apple Silicon): bullseye, buster
ARG VARIANT=bullseye
FROM mcr.microsoft.com/vscode/devcontainers/base:${VARIANT}

RUN    apt update \
    && apt upgrade -y \
    && apt install -y \
    build-essential git wget binfmt-support qemu gcc-9 \
    parted gcc-avr avr-libc avrdude python3 python3-pip python3-tornado \
    inetutils-ping curl unzip python3-setuptools gcc-arm-linux-gnueabihf bc vim locate sudo \
    && update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-9 9 \
    && /usr/bin/python3 -m pip install -U yapf \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt install -y nodejs \
    && mkdir -p /root/.ssh \
    && echo "Host onefinity" > /root/.ssh/config \
    && echo "\tUser bbmc" >> /root/.ssh/config
