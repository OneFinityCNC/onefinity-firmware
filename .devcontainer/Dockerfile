# See here for image contents: https://github.com/microsoft/vscode-dev-containers/blob/v0.241.1/containers/debian/.devcontainer/base.Dockerfile

# [Choice] Debian version (use bullseye on local arm64/Apple Silicon): bullseye, buster
ARG VARIANT=bullseye
FROM mcr.microsoft.com/vscode/devcontainers/base:${VARIANT}
COPY ./install_tools.sh /tmp/install_tools.sh
RUN /tmp/install_tools.sh
