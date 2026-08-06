#!/usr/bin/env bash
set -euo pipefail

article_path_pattern='^content/posts/[0-9]{4}/[a-z0-9]+(-[a-z0-9]+)*\.md$'

if [[ "$#" -ne 1 ]]; then
	exit 1
fi

article_path="$1"
if [[ ! "$article_path" =~ $article_path_pattern ]]; then
	exit 1
fi

printf '%s\n' "$article_path"
