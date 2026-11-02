#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
python3 install.py
printf '\n按回车关闭窗口。'
read -r answer
