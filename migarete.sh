#!/bin/bash
set -e

echo "Migarate DB for $@"
mkdir -p /var/migarate

echo "Start Dump"

for  db in $@
do :
    mongodump --db $db --out /var/migarate
done

echo "Start Copy"
ssh root@185.19.201.61 "mkdir -p /var/migarate && rm -r /var/migarate/*"
scp -r /var/migarate  root@185.19.201.61:/var/

echo "Restore DB"
ssh root@185.19.201.61 "mongorestore --drop  mongodb://127.0.0.1:27017/?directConnection=true /var/migarate"
