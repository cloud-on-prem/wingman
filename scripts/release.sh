#!/bin/bash

# Script to bump the version, update lockfile, commit, and tag for a new release.

set -e # Exit immediately if a command exits with a non-zero status.

# Check if a version is provided
if [ -z "$1" ]; then
  echo "Usage: ./scripts/release.sh <version>"
  echo "Example: ./scripts/release.sh 0.1.0"
  exit 1
fi

VERSION=$1
TAG_NAME="vscode-v$VERSION"

echo "Bumping version to $VERSION..."

# Update the version in package.json
# Using node to parse/update JSON is safer than sed
node -e "
  const fs = require('fs');
  const pkgPath = 'package.json';
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = '$VERSION';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('Updated package.json version to', pkg.version);
"

echo "Updating package-lock.json..."
npm install

echo "Staging and committing version bump..."
git add package.json package-lock.json
git commit -m "Bump vscode extension to v$VERSION"

echo "Creating git tag $TAG_NAME..."
git tag "$TAG_NAME"

echo ""
echo "✅ Version bumped to $VERSION, changes committed, and tag '$TAG_NAME' created."
echo "Ready to be published. Run 'git push && git push --tags' to push the commit and tag."
echo "The GitHub workflow should then create a release."
