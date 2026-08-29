#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 1 ]]; then
	exit 0
fi

changed_path="$1"

case "$changed_path" in
	content/*|config/about/timeline.json|config/about/links.json|eslint.config.mjs|scripts/requires-mobile-quality.sh|.github/*|docs/*|test/*|e2e/*|backups/*|workers/*)
		exit 1
		;;
	*)
		printf '%s\n' "$changed_path"
		exit 0
		;;
esac
