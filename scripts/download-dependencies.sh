#!/bin/bash -ex

# To use, copy this file, and requirements.txt into a folder on the controller, and run this script.
# Then, copy the contents of ./installer/python-packages back to your development environment

pip3 download -d installer/python-packages -r requirements.txt
