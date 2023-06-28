#!/bin/bash
# ./certbot.sh {domain} {result path} {root path}
set -eux
certbot certonly --eff-email --agree-tos -m info@nodeeweb.com --no-permissions-check --key-path $2/key.pem --fullchain-path $2/origin.pem --duplicate --webroot-path $3 --webroot -d $1