#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 2 ]]; then
	exit 1
fi

branch="$1"
changed_path="$2"
branch_pattern='^admin/config/([A-Za-z][A-Za-z0-9]*)/[0-9]{8}-[0-9]{6}-[a-z0-9]{6}$'

if [[ ! "$branch" =~ $branch_pattern ]]; then
	exit 1
fi

kind="${BASH_REMATCH[1]}"
case "$kind" in
	article)
		expected_path='config/site/article.json'
		;;
	categories)
		expected_path='config/taxonomy/categories.json'
		;;
	navigation)
		expected_path='config/site/navigation.json'
		;;
	footer)
		expected_path='config/site/footer.json'
		;;
	modules)
		expected_path='config/site/modules.json'
		;;
	weather)
		expected_path='config/site/weather.json'
		;;
	newsSources)
		expected_path='config/news/sources.json'
		;;
	aboutTimeline)
		expected_path='config/about/timeline.json'
		;;
	aboutLinks)
		expected_path='config/about/links.json'
		;;
	*)
		exit 1
		;;
esac

if [[ "$changed_path" != "$expected_path" ]]; then
	exit 1
fi

printf '%s\n' "$changed_path"
