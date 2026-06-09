#!/bin/bash
# Hermes Overlay build script

set -e

echo "🔧 Building Hermes Overlay..."

# Install dependencies
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Build renderer
echo "🎨 Building React renderer..."
npm run build:renderer

# Build main process
echo "⚙️  Building Electron main process..."
npm run build:main

# Create distribution
echo "📦 Creating Electron distribution..."
npm run dist

echo "✅ Build complete! Distribution ready in ./dist/"
