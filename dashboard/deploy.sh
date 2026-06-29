#!/bin/bash

APP_NAME="lad-dashboard"
CONTAINER_NAME="lad-dashboard-container"
PORT_MAPPING="5137:3000"
API_BASE_URL="${VITE_API_BASE_URL:-}"

print_step() {
  echo -e "\n🔷 \033[1;34m$1...\033[0m"
}

print_success() {
  echo -e "✅ \033[1;32m$1\033[0m"
}

print_error() {
  echo -e "❌ \033[1;31m$1\033[0m"
}

print_divider() {
  echo "--------------------------------------------------"
}

echo -e "\n🚀 \033[1;36mStarting Docker Deployment for $APP_NAME\033[0m"
print_divider

print_step "Step 1/3: Building Docker image [$APP_NAME]"
if [ -z "$API_BASE_URL" ]; then
  print_error "VITE_API_BASE_URL is not set."
  echo "Example:"
  echo "  VITE_API_BASE_URL=https://api.example.com sudo ./deploy.sh"
  exit 1
fi

if docker build --build-arg VITE_API_BASE_URL="$API_BASE_URL" -t "$APP_NAME" .; then
  print_success "Image built successfully."
else
  print_error "Docker build failed."
  exit 1
fi

print_step "Step 2/3: Removing existing container [$CONTAINER_NAME] if exists"
if docker ps -a --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}\$"; then
  docker stop "$CONTAINER_NAME" && docker rm "$CONTAINER_NAME" && \
    print_success "Old container removed."
else
  echo "ℹ️  No existing container found."
fi

print_step "Step 3/3: Starting new container [$CONTAINER_NAME]"
if docker run -d -p "$PORT_MAPPING" --name "$CONTAINER_NAME" "$APP_NAME"; then
  print_success "Container is running!"
  echo -e "🌍 Access it at: \033[1;33mhttp://localhost:${PORT_MAPPING%%:*}\033[0m"
else
  print_error "Failed to start container."
  exit 1
fi

print_divider
echo -e "🎉 \033[1;36mDeployment completed successfully!\033[0m"
