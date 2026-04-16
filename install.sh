#!/usr/bin/env bash
set -e

REPO="https://github.com/szymonsheng2045/laozi-cli.git"
INSTALL_DIR="$HOME/.laozi-cli"

command -v node >/dev/null 2>&1 || {
  echo "Error: Node.js is required but not installed."
  echo "Please install Node.js 18+ first: https://nodejs.org/"
  exit 1
}

command -v git >/dev/null 2>&1 || {
  echo "Error: git is required but not installed."
  exit 1
}

echo "Installing laozi-cli..."

if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation at $INSTALL_DIR"
  cd "$INSTALL_DIR"
  git pull origin main
else
  git clone "$REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

npm install
npm run build
npm link

echo ""
echo "laozi-cli installed successfully!"
echo ""
echo "Next steps:"
echo "  1. Configure your API key:"
echo "     laozi config --api-key <YOUR_KEY> --base-url https://api.openai.com/v1"
echo ""
echo "  2. Analyze some text:"
echo "     laozi check '专家说每天喝醋能软化血管'"
echo ""
echo "  3. Analyze a voice message:"
echo "     laozi voice ~/Downloads/voice.m4a"
echo ""
