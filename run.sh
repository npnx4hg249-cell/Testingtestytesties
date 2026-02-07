#!/bin/bash

# CC Shifter - Setup and Run Script
# This script installs dependencies and starts the application

set -e

echo "=========================================="
echo "  CC Shifter - Shift Planning Application"
echo "=========================================="
echo ""

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 18+."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Warning: Node.js version $NODE_VERSION detected. Version 18+ is recommended."
fi

echo "Installing server dependencies..."
npm install

echo ""
echo "Installing client dependencies..."
cd client && npm install && cd ..

echo ""
echo "=========================================="
echo "  Starting CC Shifter"
echo "=========================================="
echo ""
echo "The application will start in development mode."
echo ""
echo "  Server: http://localhost:3001"
echo "  Client: http://localhost:3000"
echo ""
echo "Default Admin Login:"
echo "  Email: admin@example.com"
echo "  Password: Admin123!@#"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""
echo "=========================================="
echo ""

# Start in development mode
npm run dev
