#!/bin/bash
# Force UTF-8 encoding for Jekyll build
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
export RUBYOPT="-E utf-8:utf-8"

echo "Starting Jekyll with UTF-8 encoding..."
bundle exec jekyll serve -l -H localhost --port 4000
