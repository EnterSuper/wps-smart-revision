#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p SmartRevisionKeys.app/Contents/MacOS
# Set SDKROOT explicitly when the default SDK and installed compiler differ.
clang ${SDKROOT:+-isysroot "$SDKROOT"} -arch arm64 -arch x86_64 -fobjc-arc \
  -Wno-deprecated-declarations -Wno-incompatible-pointer-types -mmacosx-version-min=12.0 \
  -framework Cocoa -framework Carbon SmartRevisionKeys.m \
  -o SmartRevisionKeys.app/Contents/MacOS/SmartRevisionKeys
