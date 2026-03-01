#!/bin/bash

# Azure Web App Configuration Script for Nostria Relay Monitor
# Run this script after creating your Azure Web App

set -e

# Function to display usage
usage() {
    echo "Usage: $0 -g <resource-group> -n <web-app-name> [-i <container-image>]"
    echo "  -g: Azure Resource Group name (required)"
    echo "  -n: Azure Web App name (required)"
    echo "  -i: Container image (default: ghcr.io/nostria-app/nostria-relay-monitor:latest)"
    exit 1
}

# Default values
CONTAINER_IMAGE="ghcr.io/nostria-app/nostria-relay-monitor:latest"

# Parse command line arguments
while getopts "g:n:i:h" opt; do
    case ${opt} in
        g)
            RESOURCE_GROUP=$OPTARG
            ;;
        n)
            WEB_APP_NAME=$OPTARG
            ;;
        i)
            CONTAINER_IMAGE=$OPTARG
            ;;
        h)
            usage
            ;;
        \?)
            echo "Invalid option: $OPTARG" 1>&2
            usage
            ;;
    esac
done

# Check required parameters
if [ -z "$RESOURCE_GROUP" ] || [ -z "$WEB_APP_NAME" ]; then
    echo "❌ Error: Resource group and web app name are required"
    usage
fi

echo "🔧 Configuring Azure Web App: $WEB_APP_NAME"

# Configure application settings
echo "📝 Setting application settings..."
az webapp config appsettings set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$WEB_APP_NAME" \
    --settings \
        NODE_ENV=production \
        PORT=3000 \
        WEBSITES_ENABLE_APP_SERVICE_STORAGE=true \
        WEBSITES_CONTAINER_START_TIME_LIMIT=1800 \
        WEBSITE_HEALTHCHECK_MAXPINGFAILURES=10 \
        WEBSITE_HEALTHCHECK_MAXUNHEALTHYWORKERPERCENT=100 \
        CHECK_INTERVAL_MS=1800000 \
        DATA_RETENTION_DAYS=14

echo "✅ Application settings configured successfully"

# Configure general settings
echo "⚙️ Configuring general settings..."
az webapp config set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$WEB_APP_NAME" \
    --always-on true

echo "✅ General settings configured successfully"

# Configure container settings
echo "🐳 Configuring container settings..."
az webapp config container set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$WEB_APP_NAME" \
    --docker-custom-image-name "$CONTAINER_IMAGE" \
    --docker-registry-server-url "https://ghcr.io"

echo "✅ Container settings configured successfully"

# Get the app URL
APP_URL=$(az webapp show --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" --query defaultHostName --output tsv)

echo ""
echo "🎉 Configuration completed successfully!"
echo "📊 Relay Dashboard: https://$APP_URL"
echo "❤️  Health: https://$APP_URL/health"
echo ""
echo "⚠️  Manual steps required:"
echo "1. Go to Azure Portal > $WEB_APP_NAME > Health check"
echo "2. Enable health check"
echo "3. Set Health check path: /health"
echo "4. Set Unhealthy threshold: 10"
echo "5. Save the configuration"
echo ""
echo "✨ Azure Web App configuration script completed!"
