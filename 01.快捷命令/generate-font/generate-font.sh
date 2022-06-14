#!/bin/sh

# 当前路径
bashPath=$(cd `dirname $0`; pwd)

tmpDir=$bashPath/.tmp
distDir=$bashPath/dist
assetDir=$bashPath/asset

# 创建临时目录，并拷贝资源到对应目录中
rm -rf $distDir
rm -rf $tmpDir
cp -r $assetDir $tmpDir

node $bashPath/gather-all-char.js & pid=$!

wait $pid

# font-spider --debug $tmpDir/index.html
font-spider $tmpDir/index.html

mkdir $distDir
mv $tmpDir/font/**.ttf $distDir/

rm -rf $tmpDir

clear

echo -en "\033[31;5mcall generate-font success..\033[0m]."