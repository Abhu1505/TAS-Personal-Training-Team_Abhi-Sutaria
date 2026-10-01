#!/bin/bash
cd /workspace && python3 -m http.server 8137 >/tmp/http8137.log 2>&1 &
echo $! > /tmp/http8137.pid
