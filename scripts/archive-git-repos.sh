#!/usr/bin/env bash

cd "$SYSTEM_CONFIG_DIR/archiver" || exit

rm -rf ./temp/
mkdir ./temp

bun run index.ts

DATE=$(date "+%Y-%m-%d")
echo "UPLOADING TO S3..."

aws s3 cp ./last-archive.zip s3://firesquidpersonal/code-archives/"$DATE".zip
rm last-archive.zip
