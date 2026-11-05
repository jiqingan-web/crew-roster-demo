#!/bin/sh
# 生成 Windows 演示版 exe（内嵌 show/ js/ css/，完全离线）：sh tools/launcher/build.sh → dist/机组智能排班助手-演示版.exe
set -e; cd "$(dirname "$0")"; R=../..
rm -rf app && mkdir app && cp -r $R/show $R/js $R/css app/
sed -i.bak 's#<a class="btn" href="\.\./intro/"[^>]*>介绍</a>##' app/show/index.html && rm -f app/show/index.html.bak
mkdir -p $R/dist && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o "$R/dist/机组智能排班助手-演示版.exe" .
rm -rf app; echo "OK: dist/机组智能排班助手-演示版.exe"
