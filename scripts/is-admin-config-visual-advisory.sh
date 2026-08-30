#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
	exit 1
fi

branch="$1"
changed_path="$2"
content_diff_file="$3"
branch_pattern='^admin/config/article/[0-9]{8}-[0-9]{6}-[a-z0-9]{6}$'
enabled_pattern='^[+-][[:space:]]*"enabled":[[:space:]]*(true|false),?[[:space:]]*$'

if [[ ! "$branch" =~ $branch_pattern ]]; then
	exit 1
fi

if [[ "$changed_path" != 'config/site/article.json' || ! -f "$content_diff_file" ]]; then
	exit 1
fi

added_count=0
removed_count=0
while IFS= read -r line || [[ -n "$line" ]]; do
	case "$line" in
		'--- '*|'+++ '*)
			continue
			;;
		-*)
			if [[ ! "$line" =~ $enabled_pattern ]]; then
				exit 1
			fi
			removed_count=$((removed_count + 1))
			;;
		+*)
			if [[ ! "$line" =~ $enabled_pattern ]]; then
				exit 1
			fi
			added_count=$((added_count + 1))
			;;
	esac
done < "$content_diff_file"

if [[ "$added_count" -eq 0 || "$added_count" -ne "$removed_count" ]]; then
	exit 1
fi

printf '%s\n' "$changed_path"
