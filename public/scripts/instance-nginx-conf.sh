#!/bin/bash
# ./instance-nginx-conf.sh {domain} {service name} {conf path}
# template exist in {conf path}/template.conf
set -eux

my_old_configs=`docker config ls --format {{.Name}} | grep $1`
last_version="00"
curr_version="01"
version_regex=".+-v([0-9]+)$"
remove_conf_args=""

# initial old versions
for conf in $my_old_configs ; 
    do
        if [[ $conf =~ $version_regex ]] 
            then
              last_version=${BASH_REMATCH[1]}
            fi
        remove_conf_args+="--conf-rm $conf "
done
last_version=$(expr ${last_version} + 0)
curr_version=$(printf "%02d" $((last_version + 1)))


# create nginx config file
template=$( cat $3/template.conf )
new_conf=$(echo "$template" | sed -e 's/%DOMAIN%/${1}/g' -e 's/%MY_SERVER%/${2}/g')
echo $new_conf >> $3/$1

# create new config
docker config create nginx-$1-v$curr_version $3/$1

# update nginx
docker service update -d $remove_conf_args --config-add source=nginx-$1-v$curr_version,target=/etc/nginx/sites-available/$1 nodeeweb_webproxy