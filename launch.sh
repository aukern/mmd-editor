#!/usr/bin/env bash
cd "$(dirname "$0")"
nohup python3 launch.py &>/dev/null &
